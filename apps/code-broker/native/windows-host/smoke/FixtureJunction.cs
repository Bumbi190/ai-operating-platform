using System.Buffers.Binary;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
namespace Omnira.CodeBroker.Host.Smoke;
internal static class FixtureJunction {
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint create,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true)]
    static extern bool DeviceIoControl(SafeFileHandle file,uint code,byte[] input,int size,IntPtr output,int outputSize,out int returned,IntPtr overlap);
    public static void Create(string ownedLink,string ownedTarget) {
        Directory.CreateDirectory(ownedLink);
        var substitute=Encoding.Unicode.GetBytes("\\??\\"+Path.GetFullPath(ownedTarget)+"\0");
        var print=Encoding.Unicode.GetBytes(Path.GetFullPath(ownedTarget)+"\0");
        var data=new byte[16+substitute.Length+print.Length];
        BinaryPrimitives.WriteUInt32LittleEndian(data,0xa0000003);
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(4),(ushort)(data.Length-8));
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(10),(ushort)(substitute.Length-2));
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(12),(ushort)substitute.Length);
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(14),(ushort)(print.Length-2));
        substitute.CopyTo(data,16);print.CopyTo(data,16+substitute.Length);
        using var handle=CreateFileW(ownedLink,0x40000000,0,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
        if(handle.IsInvalid||!DeviceIoControl(handle,0x900a4,data,data.Length,IntPtr.Zero,0,out _,IntPtr.Zero))
            throw new Exception("fixture junction creation failed");
    }
}
