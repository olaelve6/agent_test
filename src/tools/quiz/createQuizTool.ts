import { Tool } from "../types";

export type QuizQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
};

export const createQuizTool: Tool = {
  name: "createQuiz",

  description:
    "Renders a multiple-choice quiz as a single Adaptive Card containing " +
    "one or more questions. Call this when the user wants a quiz. You author " +
    "each question, its answer options, and which option is correct, based " +
    "on the topic the user requested.",

  parameters: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description:
          "The list of quiz questions to include in the card. " +
          "Provide between 1 and 10 questions.",
        minItems: 1,
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The quiz question text."
            },
            options: {
              type: "array",
              items: { type: "string" },
              description:
                "Between 2 and 5 answer choices for this question. " +
                "Exactly one must be correct.",
              minItems: 2,
              maxItems: 5
            },
            correctAnswer: {
              type: "string",
              description:
                "The option string that is the correct answer for this " +
                "question. Must match one entry in `options` exactly."
            }
          },
          required: ["question", "options", "correctAnswer"]
        }
      }
    },
    required: ["questions"]
  },

  async execute(input: { questions: QuizQuestion[] }) {
    return {
      type: "quiz",
      questions: input.questions
    };
  }
};