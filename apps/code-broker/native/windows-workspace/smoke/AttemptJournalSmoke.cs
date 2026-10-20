using System.Text.Json;
using Omnira.CodeBroker.Workspace;
namespace Omnira.CodeBroker.Workspace.Smoke;
internal static class AttemptJournalSmoke {
 static WorkspaceRequest Request()=>new("sdf.windows_workspace_request.v1","c435e423-d964-428b-b5c0-4060d89ce3c6",RepositoryLocation.RepositoryId,new string('b',40),new string('a',64),"2e0f09eb-cf7e-4619-834b-d78aa0ca5a7a",1);
 static void Reserve(string root,WorkspaceRequest r,Guid a)=>File.WriteAllText(Path.Combine(root,MaterializationAttemptJournal.ReservationName(a)),JsonSerializer.Serialize(new{schema="sdf.windows_materialization_reservation.v1",r.WorkId,r.RepositoryId,r.PinnedBaseSha,r.AdmissionHash,r.ClaimId,r.Fence,attemptId=a.ToString()},WorkspaceJson.Options));
 internal static async Task Run(Action<string,bool> check){
  var root=PathProcessSmoke.Fixture();Directory.CreateDirectory(root);
  try{
   var r=Request();var a=Guid.NewGuid();Reserve(root,r,a);using(new MaterializationAttemptJournal(root).Begin(r,a,false)){}
   check("persistent_attempt_replay_refused",PathProcessSmoke.Refused(()=>new MaterializationAttemptJournal(root).Begin(r,a,false)));
   using(new MaterializationAttemptJournal(root).Begin(r,a,true)){}
   var b=Guid.NewGuid();Reserve(root,r,b);using(new MaterializationAttemptJournal(root).Begin(r,b,true)){}
   check("cleanup_tombstone_prevents_late_start",PathProcessSmoke.Refused(()=>new MaterializationAttemptJournal(root).Begin(r,b,false)));
   var c=Guid.NewGuid();Reserve(root,r,c);check("foreign_binding_before_started_marker",PathProcessSmoke.Refused(()=>new MaterializationAttemptJournal(root).Begin(r with{Fence=2},c,false))&&!File.Exists(Path.Combine(root,c.ToString()+".started.json")));
   var d=Guid.NewGuid();Reserve(root,r,d);
   using(var held=new MaterializationAttemptJournal(root).Begin(r,d,false))check("held_reservation_cannot_change",PathProcessSmoke.IoRefused(()=>File.WriteAllText(Path.Combine(root,MaterializationAttemptJournal.ReservationName(d)),"changed")));
   var e=Guid.NewGuid();var guard=new MaterializationAttemptGuard(e);check("same_attempt_nonblocking_mutex",PathProcessSmoke.Refused(()=>new MaterializationAttemptGuard(e)));await Task.Run(()=>guard.Dispose());using(var again=new MaterializationAttemptGuard(e))check("async_release_not_thread_affine",true);
  }finally{Directory.Delete(root,true);}
  check("journal_fixture_removed",!Directory.Exists(root));
 }
}
