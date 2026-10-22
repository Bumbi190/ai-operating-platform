namespace Omnira.CodeBroker.Host;
// HTTP owns this cancellable view; the observation retains the native pipe until peer revalidation.
internal sealed class BorrowedPipeStream:Stream {
    readonly Stream inner;readonly CancellationTokenSource closed=new();
    public BorrowedPipeStream(Stream inner){this.inner=inner;}
    public override bool CanRead=>inner.CanRead;public override bool CanWrite=>inner.CanWrite;public override bool CanSeek=>false;
    public override long Length=>throw new NotSupportedException();
    public override long Position{get=>throw new NotSupportedException();set=>throw new NotSupportedException();}
    public override void Flush()=>inner.Flush();
    public override Task FlushAsync(CancellationToken c)=>inner.FlushAsync(c);
    public override int Read(byte[] b,int o,int n)=>inner.Read(b,o,n);
    public override async ValueTask<int> ReadAsync(Memory<byte> b,CancellationToken c=default) {
        using var linked=CancellationTokenSource.CreateLinkedTokenSource(c,closed.Token);
        return await inner.ReadAsync(b,linked.Token);
    }
    public override Task<int> ReadAsync(byte[] b,int o,int n,CancellationToken c)=>ReadAsync(b.AsMemory(o,n),c).AsTask();
    public override void Write(byte[] b,int o,int n)=>inner.Write(b,o,n);
    public override async ValueTask WriteAsync(ReadOnlyMemory<byte> b,CancellationToken c=default) {
        using var linked=CancellationTokenSource.CreateLinkedTokenSource(c,closed.Token);
        await inner.WriteAsync(b,linked.Token);
    }
    public override Task WriteAsync(byte[] b,int o,int n,CancellationToken c)=>WriteAsync(b.AsMemory(o,n),c).AsTask();
    public override long Seek(long o,SeekOrigin s)=>throw new NotSupportedException();
    public override void SetLength(long n)=>throw new NotSupportedException();
    protected override void Dispose(bool disposing){if(disposing)closed.Cancel();base.Dispose(disposing);}
}
