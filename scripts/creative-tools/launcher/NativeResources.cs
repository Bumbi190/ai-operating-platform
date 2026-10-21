using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace Omnira.Creative.Synthetic {
 internal sealed class NativeHandle:SafeHandleZeroOrMinusOneIsInvalid {
  internal NativeHandle(IntPtr value):base(true){SetHandle(value);}
  internal IntPtr Value {get{return DangerousGetHandle();}}
  protected override bool ReleaseHandle(){return NativeMethods.CloseHandle(handle);}
 }
 internal sealed class NativeBuffer:IDisposable {
  internal IntPtr Value;internal readonly int Size;
  internal NativeBuffer(int bytes){NativeMethods.Require(bytes>0&&bytes<=65536,"native-buffer-bound");Size=bytes;Value=Marshal.AllocHGlobal(bytes);for(int i=0;i<bytes;i++)Marshal.WriteByte(Value,i,0);}
  public void Dispose(){if(Value!=IntPtr.Zero){Marshal.FreeHGlobal(Value);Value=IntPtr.Zero;}}
 }
}