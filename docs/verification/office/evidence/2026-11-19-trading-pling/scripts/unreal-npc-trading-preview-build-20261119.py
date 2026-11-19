from pathlib import Path
import unreal as u,json,hashlib,sys,time
ROOT=Path(r'C:\Users\Andre\Projects\Omnira\Design\Agent-Campus-3D\UnrealPilot\Omnira_Office_CastQA_v83')
WT=Path(r'D:\Projekt\Omnira\Worktrees\office-workflow-status-20261118')
sys.path.insert(0,str(WT/'scripts/office-launcher'))
from office_workflow_native_guard import check_workflow_native
from office_workflow_target import default_workflow_target
from build_office_workflow_native import sig
from office_install_guard import digest
out=ROOT/'Saved/OfficeTradingFix20261119';out.mkdir(exist_ok=True)
lvl=u.get_editor_subsystem(u.LevelEditorSubsystem);sub=u.get_editor_subsystem(u.EditorActorSubsystem);ed=u.get_editor_subsystem(u.UnrealEditorSubsystem)
assert not lvl.is_in_play_in_editor()
assert not u.EditorLoadingAndSavingUtils.get_dirty_content_packages() and not u.EditorLoadingAndSavingUtils.get_dirty_map_packages()
receipt=json.loads((ROOT/'Saved/OfficeWorkflowInstall/installation.json').read_text())
bundle=Path(r'C:\Users\Andre\AppData\Local\Omnira\OfficeLauncher\workflow')/receipt['bundle_id']
check_workflow_native(default_workflow_target(),bundle)
src='/Game/OmniraRealismLab/Maps/Omnira_HQ_Office_Workflow_Visit'
dst='/Game/OmniraRealismLab/Maps/Previews/Omnira_Office_TradingResident_Review_20261119'
preview_exists=u.EditorAssetLibrary.does_asset_exist(dst)
assert lvl.load_level(src)
before={a.get_name():sig(a) for a in sub.get_all_level_actors()}
protected={str(ROOT/('Content'+p[5:]+ext)):digest(ROOT/('Content'+p[5:]+ext)) for p,ext in [(src,'.umap'),(receipt['copy_source'],'.umap'),(receipt['asset'],'.uasset')]}
for p in [default_workflow_target().project,ROOT/'Saved/OfficeWorkflowInstall/installation.json']:protected[str(p)]=digest(p)
if not preview_exists:assert u.EditorLoadingAndSavingUtils.save_map(ed.get_editor_world(),dst)
assert lvl.load_level(dst)
actors={a.get_name():a for a in sub.get_all_level_actors()}
assert all(sig(actors[n])==v for n,v in before.items())
w=ed.get_editor_world()
raw={'HomePoint':(2550,-1100,510),'CoffeePoint':(-590,-1300,10),'PingPoint':(-160,1720,510),'FilmPoint':(700,1780,510),'RoamA':(2100,650,510),'RoamB':(1100,650,510)}
points={};paths={}
for k,p in raw.items():
 q=u.NavigationSystemV1.project_point_to_navigation(w,u.Vector(*p),None,None,u.Vector(45,45,65))
 assert q and (q-u.Vector(*p)).length()<35,(k,p,q)
 points[k]=q
for k,p in points.items():
 if k=='HomePoint':continue
 path=u.NavigationSystemV1.find_path_to_location_synchronously(w,points['HomePoint'],p)
 assert path and path.is_valid() and not path.is_partial(),k
 paths[k]=path.get_path_length()
template=next(a for a in actors.values() if a.get_actor_label()=='Resident | Handlar-Pling')
cls=template.get_class()
a=sub.spawn_actor_from_class(cls,points['HomePoint']+u.Vector(0,0,65),u.Rotator(0,90,0))
a.set_actor_label('Resident | Trading-Pling');a.set_folder_path('Omnira/Office Free Life/Residents')
for k,p in points.items():a.set_editor_property(k,p)
for k in ['CoffeeFace','PingFace','FilmFace']:a.set_editor_property(k,template.get_editor_property(k))
for k,v in {'RoleIndex':3,'InitialDelay':3.,'FirstActivity':5,'OfficeAvatar':actors['SkeletalMeshActor_6']}.items():a.set_editor_property(k,v)
props={}
for i,k in enumerate(['CupRoot','CupTop','PaddleRoot','PaddleHandle']):
 source=template.get_editor_property(k);sc=source.get_component_by_class(u.StaticMeshComponent)
 b=sub.spawn_actor_from_class(u.StaticMeshActor,u.Vector(0,0,-1200-i*30));b.set_actor_label('Free Life | Trading '+k);b.set_folder_path('Omnira/Office Free Life/Trading Props')
 c=b.get_component_by_class(u.StaticMeshComponent);c.set_mobility(u.ComponentMobility.MOVABLE);c.set_static_mesh(sc.static_mesh)
 b.set_actor_scale3d(source.get_actor_scale3d());b.set_actor_rotation(source.get_actor_rotation(),False)
 for j in range(sc.get_num_materials()):c.set_material(j,sc.get_material(j))
 c.set_collision_profile_name('NoCollision');c.set_editor_property('can_ever_affect_navigation',False)
 a.set_editor_property(k,b);props[k]=b.get_name()
assert lvl.save_current_level()
after={x.get_name():sig(x) for x in sub.get_all_level_actors()}
assert len(after)==len(before)+5 and all(after[n]==v for n,v in before.items())
assert all(digest(p)==h for p,h in protected.items())
result={'passed':True,'map':dst,'source':src,'resident':a.get_name(),'legacy':'SkeletalMeshActor_6','original_signatures':before,'preview_signatures':after,'protected':protected,'props':props,'paths':paths,'map_sha256':digest(ROOT/('Content'+dst[5:]+'.umap'))}
(out/'preview.json').write_text(json.dumps(result,indent=2))
print('TRADING_PREVIEW_SAVED',len(before),len(after),a.get_name())
