export interface QuestionnaireData {
  style: string;
  palette: {
    mode: string;
    custom_colors: string[];
  };
  density: string;
  layout: {
    structure: string;
  };
  font: string;
  interactivity: string;
}

export interface DesignTokens {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    accent: string;
  };
  typography: {
    fontFamily: string;
    headingSize: string;
    bodySize: string;
    lineHeight: string;
  };
  spacing: {
    unit: string;
    small: string;
    medium: string;
    large: string;
  };
  layout: {
    maxWidth: string;
    columns: number;
    gap: string;
  };
}
