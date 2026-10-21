using System;
using System.Runtime.InteropServices;
using System.Threading;
namespace Omnira.Creative.Synthetic {
 // Each pump owns its native thread handle until joined. The writer alone owns stdin.
 internal sealed class PipeSession {
  sealed class Pump {
   internal Thread Thread;
   internal volatile NativeHandle Native;
   internal readonly ManualResetEvent Ready=new ManualResetEvent(false);
   internal bool Started;
   internal volatile bool Initialized;
   internal volatile bool Complete;
   internal volatile int Count;
   internal readonly byte[] Bytes=new byte[4096];
  }
  readonly BoundarySession session;
  readonly OperationBudget budget;
  readonly Pump writer=new Pump(),stdout=new Pump(),stderr=new Pump();
  readonly object failureGate=new object();
  volatile bool stop;
  string failure;
  internal int CancelAttempts,CancelAccepted,CancelNotFound,AbortedIo;
  bool joined;
  NativeHandle ownedInput;
  static int livePumps;
  internal static int LivePumps{get{return Interlocked.CompareExchange(ref livePumps,0,0);}}
  internal int StdoutCount{get{return stdout.Count;}}
  internal int StderrCount{get{return stderr.Count;}}
  internal string Failure{get{lock(failureGate)return failure;}}
  internal bool Finished{get{return !writer.Thread.IsAlive&&!stdout.Thread.IsAlive&&!stderr.Thread.IsAlive;}}
  internal bool OutputComplete{get{return stdout.Complete&&stderr.Complete;}}
  internal bool WriterComplete{get{return writer.Complete;}}
  internal bool StreamsComplete{get{return writer.Complete&&stdout.Complete&&stderr.Complete;}}
  PipeSession(BoundarySession s,OperationBudget b){session=s;budget=b;}
  void Fail(string code){lock(failureGate){if(failure==null)failure=code;}}
  internal static PipeSession Start(BoundarySession session,byte[] request,OperationBudget budget){
   int limit=SyntheticProtocol.RequestLimit;
#if TEST
   limit++; // Existing native protocol ingress vector exercises the child limit.
#endif
   NativeMethods.Require(request!=null&&request.Length<=limit,"pipe-request-bound");
   PipeSession p=new PipeSession(session,budget);
   byte[] owned=(byte[])request.Clone();
   NativeHandle input=session.Input;session.Input=null;p.ownedInput=input;
   try{
    p.writer.Thread=p.Make(p.writer,delegate(){p.Write(input,owned);});
    p.stdout.Thread=p.Make(p.stdout,delegate(){p.Read(p.stdout,session.Output,"stdout");});
    p.stderr.Thread=p.Make(p.stderr,delegate(){p.Read(p.stderr,session.Error,"stderr");});
    foreach(Pump pump in p.Pumps){pump.Thread.Start();pump.Started=true;}
    foreach(Pump pump in p.Pumps)NativeMethods.Require(pump.Ready.WaitOne(budget.RunRemainingMs),"pump-start-timeout");
    foreach(Pump pump in p.Pumps)NativeMethods.Require(pump.Initialized,"pump-start-failed");
    return p;
   }catch{
    if(!p.writer.Started)input.Dispose();
    p.CancelAndJoin();throw;
   }
  }
  Pump[] Pumps{get{return new Pump[]{writer,stdout,stderr};}}
  Thread Make(Pump pump,ThreadStart action){
   return new Thread(delegate(){
    Interlocked.Increment(ref livePumps);
    try{
     IntPtr held;
     NativeMethods.Check(NativeMethods.DuplicateHandle(new IntPtr(-1),NativeMethods.GetCurrentThread(),new IntPtr(-1),out held,NativeMethods.ThreadTerminate|NativeMethods.Synchronize,false,0),"pump-thread-handle");
     pump.Native=new NativeHandle(held);
     uint flags;NativeMethods.Check(NativeMethods.GetHandleInformation(held,out flags),"pump-thread-flags");
     NativeMethods.Require((flags&1)==0,"pump-thread-inheritable");
     pump.Initialized=true;pump.Ready.Set();
     action();
    }catch(Exception){Fail("pump-native-failure");}
    finally{pump.Ready.Set();Interlocked.Decrement(ref livePumps);}
   });
  }
  void Write(NativeHandle input,byte[] bytes){
   try{
    int offset=0;byte[] chunk=new byte[4096];
    while(offset<bytes.Length){
     int count=Math.Min(chunk.Length,bytes.Length-offset);Buffer.BlockCopy(bytes,offset,chunk,0,count);
     if(stop)return; // immediately before every synchronous native I/O
     uint written;
     if(!NativeMethods.WriteFile(input.Value,chunk,(uint)count,out written,IntPtr.Zero)){
      int error=Marshal.GetLastWin32Error();
      if(!stop)Fail((error==NativeMethods.ErrorBrokenPipe||error==NativeMethods.ErrorNoData)?"stdin-broken-pipe":"stdin-write");
      return;
     }
     if(written==0||written>count){Fail("stdin-write");return;}
     offset+=(int)written;
    }
    writer.Complete=true;
   }finally{input.Dispose();}
  }
  void Read(Pump pump,NativeHandle pipe,string name){
   byte[] chunk=new byte[4096];
   while(true){
    if(stop)return;
#if TEST
    // Deliberately enter the cancellation check-to-I/O race with an owned extra
    // writer. This seam and its writer do not exist in the production assembly.
    if(LifecycleTestHooks.HoldWriter&&name=="stdout"){
     while(!stop&&budget.RunRemainingMs>0)Thread.Sleep(1);
     Thread.Sleep(Math.Min(30,budget.CleanupRemainingMs));
    }
#endif
    uint count;
    if(!NativeMethods.ReadFile(pipe.Value,chunk,(uint)chunk.Length,out count,IntPtr.Zero)){
     int error=Marshal.GetLastWin32Error();
     if(error==NativeMethods.ErrorOperationAborted)Interlocked.Increment(ref AbortedIo);
     if(error==NativeMethods.ErrorBrokenPipe){pump.Complete=true;return;}
     if(!stop)Fail(name+"-read");return;
    }
    if(count==0){pump.Complete=true;return;}
    int available=pump.Bytes.Length-pump.Count;
    if(count>available){pump.Count=4097;Fail(name+"-overflow");return;}
    Buffer.BlockCopy(chunk,0,pump.Bytes,pump.Count,(int)count);pump.Count+=(int)count;
   }
  }
  internal void CancelAndJoin(){
   if(joined)return;
   stop=true;
   // Stop producers before cancelling blocked reads/writes. Do not dispose a pipe beneath I/O.
   try{session.StopOwnedJob(budget);}catch{session.MarkCleanupFailure();}
   while(true){
    bool all=true;
    foreach(Pump pump in Pumps){
     if(!pump.Started)continue;
     if(pump.Thread.Join(0))continue;
     all=false;
     // ERROR_NOT_FOUND is a completion/check-to-I/O race, not proof of completion.
     if(pump.Native!=null){
      CancelAttempts++;
      if(NativeMethods.CancelSynchronousIo(pump.Native.Value))CancelAccepted++;
      else{
       int error=Marshal.GetLastWin32Error();
       if(error==NativeMethods.ErrorNotFound)CancelNotFound++;
       else session.MarkCleanupFailure();
      }
     }
    }
    if(all)break;
    if(budget.CleanupRemainingMs==0)Environment.FailFast("synthetic-pumps-exceeded-cleanup-deadline");
    Thread.Sleep(Math.Min(5,budget.CleanupRemainingMs));
   }
   joined=true;
   ownedInput.Dispose();
   foreach(Pump pump in Pumps){if(pump.Native!=null)pump.Native.Dispose();pump.Ready.Dispose();}
  }
  internal CapturedStreams CompleteAfterStop(){
   NativeMethods.Require(Finished,"pumps-not-terminal");
   // Even the successful path joins before exposing copied capture buffers.
   CancelAndJoin();
   byte[] output=new byte[Math.Min(stdout.Count,4096)],error=new byte[Math.Min(stderr.Count,4096)];
   Buffer.BlockCopy(stdout.Bytes,0,output,0,output.Length);Buffer.BlockCopy(stderr.Bytes,0,error,0,error.Length);
   return new CapturedStreams(output,error,StreamsComplete,stdout.Count>4096||stderr.Count>4096,Failure!=null);
  }
 }
}
