using System.Text;
using System.Text.Json;
using Omnira.CodeBroker.Host;
try {
    if(args.Length!=1||args[0]!="qualify"||!OperatingSystem.IsWindows())throw new Exception();
    using var deadline=new CancellationTokenSource(14000);
    var report=await HostQualification.EvaluateAsync(deadline.Token);
    var output=JsonSerializer.Serialize(report,new JsonSerializerOptions{PropertyNamingPolicy=JsonNamingPolicy.CamelCase});
    if(Encoding.UTF8.GetByteCount(output)>262144)throw new Exception();
    Console.WriteLine(output);
    return 0;
} catch {
    Console.Error.WriteLine("broker_host_qualification_failed");
    return 1;
}
