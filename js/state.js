export const state = {
  subjectId: null,
  subjectMeta: null,
  subjects: [],
  chapters: [],
  questions: [],
  outline: null,
  syllabi: null,
  syllabusCoverage: null,
  questionCoverage: null,
  knowledge: [],
  cases: [],

  mode: 'exam',
  pool: [],
  index: 0,
  answers: {},
  revealed: {},
  submitted: false,
  startAt: 0,
  timerId: null,
  autoNext: true
};

export function resetExam() {
  state.pool = [];
  state.index = 0;
  state.answers = {};
  state.revealed = {};
  state.submitted = false;
  if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
}
