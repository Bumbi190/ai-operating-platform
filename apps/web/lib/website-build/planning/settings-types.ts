import type {BuilderSetting,ProjectRoot} from './types'
import type {WorkspaceRequestView} from '../studio/types'
export type WebsiteBuilderSettingsModel={
 root:ProjectRoot|null;rootReadable:boolean;projectsReadable:boolean
 projects:{id:string;name:string;agents:{id:string;name:string}[];setting:BuilderSetting|null;readable:boolean;workspaceRequest?:WorkspaceRequestView|null}[]
}
