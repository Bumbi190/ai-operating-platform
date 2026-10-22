using System.Formats.Tar;
namespace Omnira.CodeBroker.Workspace;
internal static class DeterministicSourceTar {
 internal static byte[] Write(SourceSnapshot snapshot){
  using var output=new MemoryStream();var dirs=new SortedSet<string>(StringComparer.Ordinal);
  foreach(var file in snapshot.Files){SourceFixturePolicy.ValidatePath(file.Path);var parts=file.Path.Split('/');for(int i=1;i<parts.Length;i++)dirs.Add(string.Join('/',parts.Take(i)));}
  if(dirs.Count+snapshot.Files.Count+1>256)throw new WorkspaceException("source_limit");
  using(var writer=new TarWriter(output,TarEntryFormat.Ustar,true)){
   foreach(var dir in dirs)writer.WriteEntry(Entry(TarEntryType.Directory,dir+"/",null));
   foreach(var file in snapshot.Files)writer.WriteEntry(Entry(TarEntryType.RegularFile,file.Path,file.Bytes));
   writer.WriteEntry(Entry(TarEntryType.RegularFile,".omnira-source-manifest.json",snapshot.ManifestBytes));
  }
  if(output.Length>SourceFixturePolicy.MaxTarBytes)throw new WorkspaceException("source_limit");return output.ToArray();
 }
 static UstarTarEntry Entry(TarEntryType type,string path,byte[]? content){
  var e=new UstarTarEntry(type,path){Uid=10001,Gid=10001,UserName="",GroupName="",ModificationTime=DateTimeOffset.UnixEpoch,Mode=type==TarEntryType.Directory?(UnixFileMode)493:(UnixFileMode)420};
  if(content!=null)e.DataStream=new MemoryStream(content,false);return e;
 }
}
