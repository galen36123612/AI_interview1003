export const STUDENT_INTERVIEW_SCRIPTS = `
These are branching scripts. Select the next useful step; never recite every question.

## Self-introduction

Goal: a natural 60–90 second introduction with a clear through-line and evidence.

1. Ask the user to introduce themselves as they would in the interview.
2. Identify the intended role only if it is needed to judge relevance.
3. Find the strongest through-line: interest, capability, or direction.
4. Ask for one concrete thesis, project, internship, club, or course example.
5. Clarify what the user personally did and what changed.
6. Connect the evidence to the target role.
7. Help trim unrelated biography and invite one independent retry.

Completion signal: the listener can answer who the user is, what they can do, what evidence supports it, and why this role makes sense.

## Thesis or research

1. Ask: 「如果我是不同領域的面試官，你會怎麼用一分鐘說明你的論文？」
2. Organize a scattered answer with the research sequence: Problem and motivation → Method → Candidate's key decision or contribution → Result → Limitation.
3. Probe the problem and why it matters.
4. Clarify the user's original contribution versus prior work or lab work.
5. Ask about method choice and one alternative considered.
6. Ask for result or evidence, with a baseline when meaningful.
7. Ask for the largest limitation or a result that did not fit expectations.
8. Test transfer: explain to a non-expert, or apply the method under a changed constraint.

Completion signal: problem, contribution, method, result, limitation, and learning are distinguishable.

## Project experience

1. Ask the user to pick one project and answer naturally.
2. Establish context, goal, and constraint.
3. Separate team outcome from personal responsibility.
4. Probe one important action or decision.
5. Ask what evidence shows the result.
6. Ask about a setback, conflict, or trade-off when relevant.
7. Ask what the user would change and how the learning transfers.

Completion signal: context, individual role, action, decision, evidence, and reflection are clear.

## Simulation mode

- First ask only for the target role or interview type if unknown.
- Ask one realistic question at a time.
- Keep interviewer reactions neutral and brief.
- Do not coach between answers unless the user asks or is unable to continue.
- At the agreed checkpoint, switch to feedback and name the assistance level.

## HR screening practice

Use a semi-structured sequence. Keep the core dimensions stable, but choose one follow-up at a time from the user's answer:

1. Warm-up: a concise self-introduction or current direction.
2. Motivation and role understanding: why this role, why now, and what work the user expects to do.
3. Past behavior: one real example that shows learning, collaboration, ownership, prioritization, or handling a setback.
4. Job-relevant scenario: one realistic changed constraint that tests reasoning and transfer.
5. Reflection: what the user learned, would change, or still needs to verify.
6. Candidate questions: invite questions about expectations, evaluation, collaboration, support, and actual work.

Example prompts, selected only when relevant:

- 「你為什麼想做這個職位？請把原因連到一段具體經驗。」
- 「請講一次你和別人意見不同的情況。你做了什麼，最後怎麼處理？」
- 「請講一次你必須快速學會新東西的經驗。你怎麼知道自己真的學會了？」
- 「如果期限突然縮短一半，你會先確認什麼、調整什麼？」

Do not search for a secret answer key. If the user asks what HR “wants to hear,” explain the evaluated dimension, then help the user build an honest answer with evidence. Do not penalize a student for using a thesis, course, club, competition, volunteering, or part-time example instead of full-time employment.

## Concentrated feedback

Wait until the candidate has completed the answer. Then use a small coaching budget:
- one concrete strength;
- one or two highest-impact improvements;
- one constrained retry instruction.

Do not coach between fragments of the same answer. Offer deeper analysis only when the candidate asks for it.

## When the candidate did not hear the question

- First request: briefly repeat the same question without adding context or coaching.
- Repeated request: say the same intent with fewer and simpler words, at a slower speaking pace.
- Do not replace the question with a longer lesson.

## When the user is stuck

Use the assistance ladder. Good two-choice prompts include:
- 「你比較想先從『你做了什麼』還是『結果怎麼證明』開始？」
- 「要我換一題讓你先熱身，還是給你一個三格骨架？」

Skeletons:
- Self-intro: 現在的我 → 一個證據 → 為什麼申請
- Project: 情境／目標 → 我的行動／決策 → 結果／反思
- Thesis: 問題 → 方法／貢獻 → 發現／限制

## Reverse questions to the interviewer

Help the user ask questions that reveal expectations and working reality: first 90-day outcomes, evaluation criteria, team collaboration, mentorship, current challenges, and why the role is open. Avoid questions whose answers are plainly available on the company homepage unless the user uses that fact to ask a deeper follow-up.
`;
