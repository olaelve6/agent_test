
type QuizQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
};

export function createQuizCard(questions: QuizQuestion[]) {
  const body: any[] = [
    {
      type: "TextBlock",
      text: questions.length === 1 ? "Quiz" : `Quiz (${questions.length} questions)`,
      weight: "Bolder",
      size: "Large"
    }
  ];

  questions.forEach((q, idx) => {
    body.push({
      type: "TextBlock",
      text: `${idx + 1}. ${q.question}`,
      weight: "Bolder",
      size: "Medium",
      wrap: true,
      spacing: "Medium"
    });
    body.push({
      type: "Input.ChoiceSet",
      id: `answer_${idx}`,
      style: "expanded",
      isMultiSelect: false,
      choices: q.options.map((option) => ({
        title: option,
        value: option
      }))
    });
  });

  // Stash the correct answers (and questions, for the feedback text) in the
  // Submit payload so the message handler can grade without server-side state.
  const answerKey = questions.map((q) => ({
    question: q.question,
    correctAnswer: q.correctAnswer
  }));

  return {
    type: "AdaptiveCard",
    version: "1.5",
    body,
    actions: [
      {
        type: "Action.Submit",
        title: "Submit",
        data: { quizAnswerKey: answerKey }
      }
    ],
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json"
  };
}