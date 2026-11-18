"""Synthetic loader compatibility probe; no map, asset, agent or network changes."""
from pathlib import Path
import json
import traceback
import unreal as u

root = Path(__file__).resolve().parents[2]
out = root / '.superpowers/office-launcher-20261112/presence'
result = {'synthetic': True, 'live_connection': False, 'world_modified': False}
try:
    assert json.loads((out/'sourceProof.json').read_text())['synthetic'] is True
    source = out/'unreal-presence-test.json'
    expected = json.loads(source.read_text(encoding='utf-8'))
    raw = u.JsonBlueprintFunctionLibrary.from_file(u.FilePath(file_path=str(source)))
    result['from_file_result_type'] = type(raw).__name__
    values = raw if isinstance(raw, tuple) else (raw,)
    objects = [value for value in values if isinstance(value, u.JsonObjectWrapper)]
    assert len(objects) == 1, str(raw)
    converted = u.JsonBlueprintFunctionLibrary.to_string(objects[0])
    values = converted if isinstance(converted, tuple) else (converted,)
    serialized = next(value for value in values if isinstance(value, str))
    loaded = json.loads(serialized)
    result['differences'] = {key: {'expected': expected.get(key), 'loaded': loaded.get(key)} for key in set(expected) | set(loaded) if expected.get(key) != loaded.get(key)}
    assert loaded == expected
    assert loaded['work_verified'] is False and loaded['execution'] == 'not_verified'
    assert loaded['agent_text'] == 'Testagent' and loaded['project_text'] == 'Testprojekt'
    assert 'voiceId' not in serialized and 'system_prompt' not in serialized
    result.update(passed=True, engine=u.SystemLibrary.get_engine_version(),
                  schema=loaded['schema'], fields_roundtripped=len(loaded))
except Exception:
    result['error'] = traceback.format_exc()
(out/'unreal-loader-proof.json').write_text(json.dumps(result, ensure_ascii=True, indent=2), encoding='utf-8')
print(json.dumps(result))
