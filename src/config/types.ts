export type StorageType = "directory" | "file"

export interface SectionConfig {
  name: string
  idField: string
  storage: StorageType
  parent?: string
  children?: string[]
  schema?: Record<string, unknown>
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