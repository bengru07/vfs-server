export type StorageType = "directory" | "file"

export interface FolderOps {
  create: boolean
  rename: boolean
  delete: boolean
  move: boolean
  list: boolean
}

export interface FolderConfig {
  enabled: boolean
  ops: FolderOps
}

export interface SectionConfig {
  name: string
  idField: string
  storage: StorageType
  parent?: string
  children?: string[]
  schema?: Record<string, unknown>
  upsert?: boolean
  folders?: FolderConfig
}

export interface AppConfig {
  dataDir: string
  port: number
  watch: boolean
  cors: string
  sections: SectionConfig[]
}

export interface ResolvedSection {
  config: SectionConfig
  isChild: boolean
  isParent: boolean
  parent?: SectionConfig
  children: SectionConfig[]
}

export interface ResolvedConfig {
  app: AppConfig
  sections: Map<string, ResolvedSection>
}

export interface FolderNode {
  name: string
  path: string
  children: FolderNode[]
  items: string[]
}
