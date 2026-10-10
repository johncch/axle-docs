---
title: Decisions
description: decide(), the question and answer types, and the typesafe() provider.
---

# Decisions

Conceptual guide: [Typed decisions](/concepts/decisions).

::: warning Experimental
Decisions are marked `@experimental`: the question, answer, and provider shapes
may change in a minor release.
:::

## decide()

```typescript
import { decide, noul, choice, score } from "@fifthrevision/axle";

decide(options: DecideParams<TQuestions>): Promise<DecideResult<TQuestions>>
```

Asks a decision model typed questions about one input. One request, one answer
per question, no conversation.

```typescript
interface DecideParams<TQuestions extends DecisionQuestions> {
  provider: DecisionProvider;
  model: string;
  /** The content every question is asked about. */
  input: DecisionInput;
  /** Questions keyed by a name of your choosing; answers come back under the same keys. */
  questions: TQuestions;
  signal?: AbortSignal;
  span?: Span;
}

interface DecideResult<TQuestions extends DecisionQuestions> {
  model: string;
  answers: DecisionAnswers<TQuestions>;
  usage: Stats;
}

type DecisionInput = string | DecisionJson[] | { [key: string]: DecisionJson };
```

`input` is a string or a JSON value (TypeSafe's wire name for it is `state`;
Axle names it `input` because "state" already means agent state). Throws
`DECISION_ANSWER_MISMATCH` when a question's answer is missing or mistyped, and
rejects — never resolves `ok: false` — on request, transport, timeout, or abort
failures.

## Questions

```typescript
noul(instructions: string, criteria?: { true: string; false: string }): NoulQuestion
choice<const TOption extends string>(instructions: string, criteria: Record<TOption, string | null>): ChoiceQuestion<TOption>
score(instructions: string, criteria: string[]): ScoreQuestion

type DecisionQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;
type DecisionQuestions = Record<string, DecisionQuestion>;
```

`choice` criteria map each option to its description, or `null`. `score`
criteria list the ordered levels, lowest first.

## Answers

```typescript
type DecisionAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer | DecisionRefusal;

interface NoulAnswer { type: "noul"; noul: number }
interface ChoiceAnswer<TOption extends string = string> {
  type: "choice";
  choice: TOption;
  probabilities: Record<TOption, number>;
  confidence: number;
}
interface ScoreAnswer {
  type: "score";
  score: number;
  probabilities: Record<string, number>;
  legend: Record<string, string>;
  confidence: number;
}
interface DecisionRefusal { type: "refusal" }

type AnswerFor<TQuestion extends DecisionQuestion> =
  TQuestion extends NoulQuestion ? NoulAnswer | DecisionRefusal
  : TQuestion extends ChoiceQuestion<infer TOption> ? ChoiceAnswer<TOption> | DecisionRefusal
  : TQuestion extends ScoreQuestion ? ScoreAnswer | DecisionRefusal
  : never;
```

`confidence` summarizes how concentrated a choice or score answer's
probabilities are — it is not the probability of the chosen answer, and it is
not comparable across models. A refusal belongs to one question; the rest of
the decision stands.

## DecisionProvider

```typescript
interface DecisionProvider {
  get name(): string;
  /** @internal */
  createDecisionRequest(model: string, params: DecisionRequestParams): Promise<DecisionResponse>;
}
```

Separate from `AIProvider`; a provider may implement either or both.
`typesafe()` implements only this one, so passing it to `stream()`,
`generate()`, or an `Agent` is a type error.

## typesafe()

```typescript
import { typesafe } from "@fifthrevision/axle";

typesafe(apiKey: string, options?: TypesafeOptions): DecisionProvider

interface TypesafeOptions extends ProviderClientOptions {
  /**
   * API root serving /v1/systemone. Defaults to https://api.typesafe.ai.
   * Point it at https://openrouter.ai/api with an OpenRouter key to route through it.
   */
  baseUrl?: string;
}
```

`timeoutMs` defaults to ten seconds per attempt, matching TypeSafe's own SDKs.
A non-2xx response throws `DECISION_REQUEST_FAILED` with the status and body in
`details`; a body Axle cannot read throws `DECISION_RESPONSE_INVALID`. The
model id is passed through unchanged.
