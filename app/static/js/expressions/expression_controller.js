export class ExpressionController {
  constructor({ mood = "calm", onChange = () => {} } = {}) {
    this.mood = mood;
    this.onChange = onChange;
    this.current = "neutral";
    this.timerIds = [];
    this.sequenceId = 0;
    this.apply(this.baseExpression());
  }

  baseExpression() {
    return this.mood === "spicy" ? "angry" : "neutral";
  }

  setMood(mood) {
    this.mood = mood;
    this.clearTimers();
    this.apply(this.baseExpression());
  }

  apply(expression) {
    const allowed = ["neutral", "happy", "concerned", "angry", "scolding"];
    this.current = allowed.includes(expression) ? expression : this.baseExpression();
    document.body.dataset.expression = this.current;
    this.onChange(this.current);
  }

  clearTimers() {
    this.sequenceId += 1;
    for (const timerId of this.timerIds) window.clearTimeout(timerId);
    this.timerIds = [];
  }

  schedule(expression, delay, sequence) {
    const timerId = window.setTimeout(() => {
      if (sequence === this.sequenceId) this.apply(expression);
    }, delay);
    this.timerIds.push(timerId);
  }

  react(reaction, { isSpeaking = false } = {}) {
    this.clearTimers();
    const sequence = this.sequenceId;

    if (reaction === "scolding" && this.mood === "spicy") {
      // Bronca curta no início da correção, expressão firme durante a explicação
      // e uma segunda ênfase visual. Os tempos são independentes do áudio.
      this.apply("scolding");
      this.schedule("angry", 2600, sequence);
      this.schedule("scolding", 5200, sequence);
      this.schedule("angry", 7000, sequence);
      if (!isSpeaking) this.schedule(this.baseExpression(), 8500, sequence);
      return;
    }

    if (reaction === "welcoming") {
      this.apply("happy");
      if (!isSpeaking) this.schedule(this.baseExpression(), 2200, sequence);
      return;
    }

    if (reaction === "correcting") {
      this.apply("concerned");
      if (!isSpeaking) this.schedule(this.baseExpression(), 2600, sequence);
      return;
    }

    this.apply(this.baseExpression());
  }

  onSpeechEnded() {
    this.clearTimers();
    this.apply(this.baseExpression());
  }

  destroy() {
    this.clearTimers();
  }
}
