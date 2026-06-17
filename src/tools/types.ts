/**
 * A minimal JSON Schema fragment describing the arguments a tool accepts.
 * Kept loose on purpose so each tool can express whatever shape it needs
 * without fighting TypeScript.
 */
export type ToolParameters = {
  type: "object";
  properties: Record<string, any>;
  required?: string[];
};

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;

  execute(input: any): Promise<any>;
}