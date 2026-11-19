"""Editor-only graph helpers; no runtime Python in the generated consumer."""
import unreal as u
class GraphOps:
 def __init__(self,bp):self.bp=bp;self.graph=u.BlueprintGraphEditor.get_graph_editor(u.BlueprintEditorLibrary.find_event_graph(bp))
 def wire(self,a,p,b,q):assert a.find_output_pin(p).try_create_connection(b.find_input_pin(q)),(str(a.get_node_title()),p,str(b.get_node_title()),q)
 def put(self,n,p,v):
  if isinstance(v,tuple):self.wire(v[0],v[1],n,p)
  else:assert n.find_input_pin(p).set_pin_value(str(v)),(str(n.get_node_title()),p,v)
 def fn(this,owner,name,module='Engine',**vals):
  n=this.graph.add_call_function_node('/Script/'+module+'.'+owner+':'+name);assert n,name
  for k,v in sorted(vals.items(),key=lambda kv:0 if isinstance(kv[1],tuple) else 1):this.put(n,k,v)
  return n,'ReturnValue'
 def get(self,name):return self.graph.add_get_member_variable_node(name),name
 def assign(self,name,val):
  n=self.graph.add_set_member_variable_node(name);self.put(n,name,val);return n
 def after(self,a,b,p='then'):self.wire(a,p,b,'execute');return b
 def branch(self,val):
  n=self.graph.add_branch_node();self.put(n,'Condition',val);return n
 def calc(self,name,a,b):return self.fn('KismetMathLibrary',name,A=a,B=b)
 def both(self,a,b):return self.calc('BooleanAND',a,b)
 def either(self,a,b):return self.calc('BooleanOR',a,b)
 def invert(self,a):return self.fn('KismetMathLibrary','Not_PreBool',A=a)
 def inc(self,name):return self.assign(name,self.calc('Add_IntInt',self.get(name),'1'))
 def valid(self,a):return self.fn('KismetSystemLibrary','IsValid',Object=a)
 def external(self,ref,cls,name):
  n=self.graph.add_get_member_variable_node(name,cls.get_path_name());assert n;self.put(n,'self',ref);return n,name
 def extset(self,ref,cls,name,value):
  n=self.graph.add_set_member_variable_node(name,cls.get_path_name());assert n;self.put(n,'self',ref);self.put(n,name,value);return n
