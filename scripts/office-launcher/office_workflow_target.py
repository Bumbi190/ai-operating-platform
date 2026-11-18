"""One fixed workflow game target; the established Office map stays untouched."""
from dataclasses import dataclass
from pathlib import Path
from office_launcher import OfficeTarget, RunningOffice, matching_office, OFFICE_MAP

WORKFLOW_MAP='/Game/OmniraRealismLab/Maps/Omnira_HQ_Office_Workflow_Visit'
REVIEW_MAP='/Game/OmniraRealismLab/Maps/Previews/Omnira_Office_WorkflowConsumer_Review_20261118'

@dataclass(frozen=True)
class WorkflowTarget(OfficeTarget):
    def verify(self):
        super().verify()
        path=self.project.parent/('Content'+WORKFLOW_MAP[5:]+'.umap')
        if not path.is_file() or path.is_symlink() or (hasattr(path,'is_junction') and path.is_junction()):
            raise ValueError('Saved workflow Office map unavailable')

    def argv(self):
        args=super().argv();args[2]=WORKFLOW_MAP;return args

def default_workflow_target():
    from office_launcher import default_target
    t=default_target();return WorkflowTarget(t.engine,t.project)

def matching_workflow(process,target):
    if not isinstance(target,WorkflowTarget) or len(process.argv)<4 or process.argv[2]!=WORKFLOW_MAP:return False
    # Reuse the exact engine/project/flag checks, changing only the fixed map.
    args=list(process.argv);args[2]=OFFICE_MAP
    return matching_office(RunningOffice(process.pid,args),OfficeTarget(target.engine,target.project))
