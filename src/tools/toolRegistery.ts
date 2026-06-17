import { createQuizTool } from "./quiz/createQuizTool";
import { findFlowcaseUserTool } from "./flowcase/findUserTool";
import { createCvFileTool } from "./cvBuilder/createCvFileTool";

// Note: Flowcase profile lookup is no longer exposed as a tool — the
// current user's profile is auto-loaded into the system prompt via
// `src/context/userContext.ts`. Re-add a findFlowcaseUser tool here if
// you later want the model to look up *other* users on demand.
export const tools = [
  createQuizTool,
  findFlowcaseUserTool,
  createCvFileTool
];
