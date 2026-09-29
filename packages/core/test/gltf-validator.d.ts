declare module 'gltf-validator' {
  export interface ValidationMessage {
    code: string;
    message: string;
    severity: 0 | 1 | 2 | 3;
    pointer?: string;
  }
  export interface ValidationReport {
    issues: {
      numErrors: number;
      numWarnings: number;
      messages: ValidationMessage[];
    };
  }
  export function validateBytes(
    data: Uint8Array,
    options?: {
      uri?: string;
      maxIssues?: number;
      externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
    },
  ): Promise<ValidationReport>;
}
