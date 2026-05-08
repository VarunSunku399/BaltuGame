// ─── Game State ───────────────────────────────────────────────────────────────
// Centralized, reactive state container for the game
// ─────────────────────────────────────────────────────────────────────────────

export const GameState = {
  // lifecycle
  status: 'idle',  // 'idle' | 'running' | 'paused' | 'dead' | 'complete'

  // scoring
  score:     0,
  highScore: parseInt(localStorage.getItem('bg_hs') || '0', 10),
  distance:  0,   // meters traveled

  // Q&A stats
  correctAnswers: 0,
  wrongAnswers:   0,
  totalQuestions: 0,

  // game pacing
  gameSpeed:  400,    // px/s, increases over time
  baseSpeed:  400,

  // question queue
  questionQueue: [],
  currentQuestion: null,
  questionActive: false,

  /** Reset for a new game (keep highScore + questionQueue) */
  resetRound() {
    this.status          = 'running';
    this.score           = 0;
    this.distance        = 0;
    this.gameSpeed       = this.baseSpeed;
    this.correctAnswers  = 0;
    this.wrongAnswers    = 0;
    this.currentQuestion = null;
    this.questionActive  = false;
  },

  addScore(pts) {
    this.score += pts;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('bg_hs', this.highScore);
    }
  },

  enqueueQuestion(q) {
    this.questionQueue.push(q);
    this.totalQuestions++;
  },

  dequeueQuestion() {
    if (this.questionQueue.length === 0) return null;
    this.currentQuestion  = this.questionQueue.shift();
    this.questionActive   = true;
    return this.currentQuestion;
  },

  answerCorrect() {
    this.correctAnswers++;
    this.addScore(150);
    this.questionActive  = false;
    this.currentQuestion = null;
  },

  answerWrong() {
    this.wrongAnswers++;
    this.questionActive  = false;
    this.currentQuestion = null;
  },

  answerTimeout() {
    this.wrongAnswers++;
    this.questionActive  = false;
    this.currentQuestion = null;
  }
};
