from pathlib import Path
import unreal as u,json,time,traceback,sys
ROOT=Path(r'C:\Users\Andre\Projects\Omnira\Design\Agent-Campus-3D\UnrealPilot\Omnira_Office_CastQA_v83')
sys.path.insert(0,r'D:\Projekt\Omnira\Worktrees\office-workflow-status-20261118\scripts\office-launcher')
from office_install_guard import digest
out=ROOT/'Saved/OfficeTradingFix20261119';p=json.loads((out/'preview.json').read_text());q={'passed':False,'samples':[],'collisions':[],'errors':[]}
lvl=u.get_editor_subsystem(u.LevelEditorSubsystem);ed=u.get_editor_subsystem(u.UnrealEditorSubsystem)
def rec():(out/'physical-qa.json').write_text(json.dumps(q,indent=2))
def seq():
 assert not lvl.is_in_play_in_editor();assert lvl.load_level(p['map']);lvl.editor_request_begin_play();yield 1
 game=ed.get_game_world();assert game
 actors={a.get_name():a for a in u.GameplayStatics.get_all_actors_of_class(game,u.Actor)}
 a=actors[p['resident']];old=actors[p['legacy']];pc=u.GameplayStatics.get_player_controller(game,0);player=pc.get_controlled_pawn()
 player.set_actor_location(u.Vector(-1750,1100,610),False,True)
 cap=a.get_component_by_class(u.CapsuleComponent);channel=next(getattr(u.CollisionChannel,n) for n in dir(u.CollisionChannel) if n.upper().endswith('PAWN'))
 q['capsule']={'radius':cap.get_scaled_capsule_radius(),'half_height':cap.get_scaled_capsule_half_height(),'collision':str(cap.get_collision_enabled()),'pawn':str(cap.get_collision_response_to_channel(channel))}
 assert 'BLOCK' in q['capsule']['pawn'].upper()
 assert old.get_editor_property('hidden'),'Legacy Trading avatar still visible'
 start=a.get_actor_location();t0=u.GameplayStatics.get_time_seconds(game)
 while u.GameplayStatics.get_time_seconds(game)<t0+23:
  q['samples'].append({'t':u.GameplayStatics.get_time_seconds(game),'loc':a.get_actor_location().to_tuple(),'speed':a.get_velocity().length(),'goal':a.get_editor_property('GoalIndex'),'travel':a.get_editor_property('IsTraveling')});rec();yield .5
 distance=(a.get_actor_location()-start).length();q['displacement_cm']=distance
 assert distance>150 and any(x['speed']>20 for x in q['samples']), 'No native movement'
 assert a.get_controller(),'No AI controller'
 a.get_controller().stop_movement();a.get_component_by_class(u.CharacterMovementComponent).disable_movement()
 pm=player.get_component_by_class(u.CharacterMovementComponent);pm.disable_movement()
 center=a.get_actor_location();pr=player.get_component_by_class(u.CapsuleComponent).get_scaled_capsule_radius();nr=cap.get_scaled_capsule_radius()
 for delta in [u.Vector(160,0,0),u.Vector(0,160,0)]:
  begin=center+delta;begin.z=center.z+25
  end=center-delta;end.z=begin.z
  player.set_actor_location(begin,False,True);hit=player.set_actor_location(end,True,False)
  row={'hit':hit.export_text() if hit else None,'player_end':player.get_actor_location().to_tuple(),'npc':center.to_tuple(),'distance':(player.get_actor_location()-center).length(),'radii':pr+nr}
  q['collisions'].append(row);rec()
  if hit and a.get_name() in hit.export_text() and row['distance']>pr+nr-8:q['player_blocked']=True;break
 assert q.get('player_blocked'),'Player sweep did not verify this NPC as blocker'
 q['legacy_hidden']=True;q['controller']=a.get_controller().get_class().get_path_name()
 lvl.editor_request_end_play();yield 1
 assert not lvl.is_in_play_in_editor()
 assert all(digest(path)==h for path,h in p['protected'].items())
 assert digest(ROOT/('Content'+p['map'][5:]+'.umap'))==p['map_sha256']
 q['passed']=True;rec()
gen=seq();state={'next':0,'busy':False}
def tick(dt):
 if state['busy'] or time.monotonic()<state['next']:return
 state['busy']=True
 try:state['next']=time.monotonic()+next(gen)
 except StopIteration:u.unregister_slate_post_tick_callback(h)
 except:
  q['errors'].append(traceback.format_exc());rec();u.unregister_slate_post_tick_callback(h)
  if lvl.is_in_play_in_editor():lvl.editor_request_end_play()
 finally:state['busy']=False
rec();h=u.register_slate_post_tick_callback(tick)
