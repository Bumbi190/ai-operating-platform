"""Subscription-backed text only CLI. No shell; no API-key fallback."""
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

class RuntimeRefused(Exception): pass
EXPECTED_VERSION='2.1.296'
def build_command(executable,model=''):
    cmd=[executable,'-p','--output-format','stream-json','--verbose','--safe-mode','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--disable-slash-commands','--no-chrome','--no-session-persistence','--setting-sources','','--settings','{"disableAllHooks":true,"enabledPlugins":{}}','--max-turns','1','--permission-prompts','none']
    if model:cmd+=['--model',model]
    return cmd
def parse_stream(output):
    init=False;result=None
    for line in output.splitlines():
        try:v=json.loads(line)
        except ValueError:raise RuntimeRefused('INVALID_RUNTIME_OUTPUT') from None
        if v.get('type')=='system' and v.get('subtype')=='init':
            if v.get('tools')!=[] or v.get('mcp_servers') not in ([],None):raise RuntimeRefused('TOOLS_NOT_DISABLED')
            init=True
        if v.get('type')=='assistant':
            if any(c.get('type')!='text' for c in v.get('message',{}).get('content',[])):raise RuntimeRefused('NON_TEXT_RESULT')
        if v.get('type')=='result':
            if v.get('is_error') or not isinstance(v.get('result'),str):raise RuntimeRefused('MODEL_UNAVAILABLE')
            result=v['result']
    if not init or result is None:raise RuntimeRefused('INCOMPLETE_RUNTIME_OUTPUT')
    return result
def runtime_environment():
    forbidden=['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL','CLAUDE_CODE_USE_BEDROCK','CLAUDE_CODE_USE_VERTEX','CLAUDE_CODE_USE_FOUNDRY','CLAUDE_CONFIG_DIR']
    if any(os.environ.get(k) for k in forbidden):raise RuntimeRefused('CUSTOM_PROVIDER_ENVIRONMENT')
    keep={'SYSTEMROOT','WINDIR','PATH','USERPROFILE','APPDATA','LOCALAPPDATA','HOMEDRIVE','HOMEPATH','HOME','TEMP','TMP','LANG','LC_ALL','SSL_CERT_FILE','SSL_CERT_DIR'}
    env={k:v for k,v in os.environ.items() if k.upper() in keep}
    env['CLAUDE_CODE_SAFE_MODE']='1';env['DISABLE_TELEMETRY']='1'
    return env
def doctor():
    executable=shutil.which('claude')
    if not executable:return {'ready':False,'reason':'CLAUDE_NOT_FOUND'}
    try:
        env=runtime_environment()
        # Refuse managed overrides rather than guessing they respect local tool/hook flags.
        paths=[Path(os.environ.get('ProgramFiles','C:/Program Files'))/'ClaudeCode/managed-settings.json',Path(os.environ.get('ProgramData','C:/ProgramData'))/'ClaudeCode/managed-settings.json',Path('/etc/claude-code/managed-settings.json')]
        if any(p.exists() for p in paths):raise RuntimeRefused('MANAGED_SETTINGS_REQUIRE_REVIEW')
        if os.name=='nt':
            import winreg
            for hive in [winreg.HKEY_LOCAL_MACHINE,winreg.HKEY_CURRENT_USER]:
                try:
                    with winreg.OpenKey(hive,r'SOFTWARE\Policies\ClaudeCode'):raise RuntimeRefused('MANAGED_POLICY_REQUIRE_REVIEW')
                except FileNotFoundError:pass
        version=subprocess.run([executable,'--version'],env=env,capture_output=True,text=True,timeout=15).stdout.strip()
        helptext=subprocess.run([executable,'--help'],env=env,capture_output=True,text=True,timeout=15).stdout
        if not version.startswith(EXPECTED_VERSION+' '):raise RuntimeRefused('CLI_VERSION_UNVERIFIED')
        for flag in ['--safe-mode','--tools','--strict-mcp-config','--no-session-persistence','--permission-prompts']:
            if flag not in helptext:raise RuntimeRefused('CLI_SURFACE_UNVERIFIED')
        return {'ready':True,'version':EXPECTED_VERSION,'executable':executable,'sendingEnabled':False}
    except Exception as e:return {'ready':False,'reason':str(e) if isinstance(e,RuntimeRefused) else 'CLI_UNAVAILABLE'}
class SafeClaudeTextRuntime:
    def __init__(self,model=''):self.model=model;self.readiness=doctor()
    def generate(self,prompt,permit_id,cancel=None):
        if not self.readiness.get('ready'):raise RuntimeRefused(self.readiness.get('reason','NOT_READY'))
        if len(prompt.encode('utf-8'))>32768:raise RuntimeRefused('PROMPT_TOO_LARGE')
        if cancel and cancel.is_set():raise RuntimeRefused('CANCELLED')
        with tempfile.TemporaryDirectory(prefix='omnira-sales-text-') as directory:
            process=subprocess.Popen(build_command(self.readiness['executable'],self.model),cwd=directory,env=runtime_environment(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            start=time.monotonic();payload=prompt.encode('utf-8')
            try:
                while True:
                    if (cancel and cancel.is_set()) or time.monotonic()-start>120:
                        process.kill();process.wait();raise RuntimeRefused('DISPATCH_UNCERTAIN')
                    try:
                        stdout,_=process.communicate(input=payload,timeout=1);break
                    except subprocess.TimeoutExpired:payload=None
                if process.returncode!=0 or len(stdout)>1048576:raise RuntimeRefused('DISPATCH_UNCERTAIN')
                return parse_stream(stdout.decode('utf-8',errors='strict'))
            finally:
                if process.poll() is None:process.kill();process.wait()
