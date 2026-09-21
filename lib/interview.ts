export type Profile={role:string;company:string;resume:string;job:string};
export type Story={id:string;title:string;situation:string;task:string;action:string;result:string;tag:string};
export type Review={score:number;words:number;fillers:number;pace:number|null;checks:{label:string;pass:boolean;advice:string}[];next:string};
export type Session={id:string;question:string;answer:string;category:string;seconds:number;createdAt:string;review:Review;ai?:string};
export const emptyProfile:Profile={role:'',company:'',resume:'',job:''};
export const categories=['Behavioral','Leadership','Role-specific','Technical','System design','Recruiter','Negotiation'] as const;
export const questions=[
{category:'Behavioral',text:'Tell me about a time you led a project through ambiguity.'},
{category:'Behavioral',text:'Describe a difficult disagreement and how you resolved it.'},
{category:'Behavioral',text:'Tell me about a mistake you made. What changed afterward?'},
{category:'Behavioral',text:'When did you have to learn something quickly?'},
{category:'Behavioral',text:'Describe a time you received difficult feedback.'},
{category:'Leadership',text:'How did you align stakeholders with competing priorities?'},
{category:'Leadership',text:'Tell me about a decision you made with incomplete information.'},
{category:'Leadership',text:'How have you helped another person grow?'},
{category:'Leadership',text:'Tell me about a time you had to say no to a valuable project.'},
{category:'Role-specific',text:'Which accomplishment best demonstrates your fit for this role?'},
{category:'Role-specific',text:'What would your first 90 days in this role look like?'},
{category:'Role-specific',text:'How do you prioritize when everything feels urgent?'},
{category:'Technical',text:'Given an array of integers and a target, return indices of two numbers that sum to the target. Explain complexity and edge cases.'},
{category:'Technical',text:'How would you diagnose a slow API endpoint in production?'},
{category:'Technical',text:'Explain how you would detect and remove a cycle in a linked list.'},
{category:'Technical',text:'Describe a safe migration for a heavily used database table.'},
{category:'System design',text:'Design a URL shortener. Discuss APIs, storage, scale, and failure modes.'},
{category:'System design',text:'Design a notification service supporting email, push, and SMS.'},
{category:'System design',text:'Design a rate limiter for a public API.'},
{category:'System design',text:'Design a collaborative document editor.'},
{category:'Recruiter',text:'Tell me about yourself and why this opportunity interests you.'},
{category:'Recruiter',text:'Why are you considering a change from your current role?'},
{category:'Recruiter',text:'What questions do you have about the team and the role?'},
{category:'Negotiation',text:'How would you respond to an offer below your target compensation?'},
{category:'Negotiation',text:'Which aspects of the offer matter most to you, and why?'},
{category:'Negotiation',text:'How would you ask for more time to evaluate an offer?'}
];
export function evaluate(answer:string,seconds:number,category:string):Review{
 const words=answer.trim()?answer.trim().split(/\s+/).length:0;
 const fillers=(answer.match(/\b(um|uh|basically|actually|literally)\b|you know|sort of|kind of/gi)||[]).length;
 const technical=category==='Technical'||category==='System design';
 const checks=technical?[
 {label:'Clarifies requirements',pass:/require|assum|constraint|input|output|user|scale/i.test(answer),advice:'State requirements, assumptions, and constraints before proposing a solution.'},
 {label:'Explains approach',pass:/approach|algorithm|hash|map|cache|queue|database|service|step|pointer/i.test(answer),advice:'Walk through the approach and explain why it fits.'},
 {label:'Discusses trade-offs',pass:/complexity|O\(|trade.?off|latency|consisten|space|time|cost/i.test(answer),advice:'Compare trade-offs and discuss time, space, latency, or cost.'},
 {label:'Covers edge cases',pass:/edge|empty|null|duplicate|fail|test|error|retry|overflow/i.test(answer),advice:'Include failure modes, boundary conditions, and a testing plan.'}
 ]:[
 {label:'Sets the scene',pass:/when|during|at my|project|team|situation|working|company/i.test(answer),advice:'Anchor the story in a specific situation.'},
 {label:'Shows ownership',pass:/\bI\s+(led|owned|built|decided|created|proposed|worked|implemented|managed|was responsible|needed|had to)/i.test(answer),advice:'Explain your responsibility and your personal contribution.'},
 {label:'Explains actions',pass:/because|first|then|decided|implemented|analy[sz]ed|prioriti[sz]ed|tested/i.test(answer),advice:'Explain what you did, in sequence, and why.'},
 {label:'Shows an outcome',pass:/result|improv|reduc|increas|achiev|learn|deliver|saved/i.test(answer),advice:'Close with the outcome and what you learned.'}
 ];
 checks.push({label:'Uses concrete detail',pass:/\d|percent|hours|weeks|customers/i.test(answer),advice:'Add an accurate number, timeframe, or concrete example.'});
 checks.push({label:'Keeps a useful length',pass:words>=60&&words<=300,advice:words<60?'Develop your answer beyond a few sentences.':'Trim repeated context and keep the focus on your contribution.'});
 const next=checks.find(c=>!c.pass)?.advice||'Rehearse once more and make the link to the target role explicit.';
 return {score:Math.round(checks.filter(c=>c.pass).length/checks.length*100),words,fillers,pace:seconds>=10?Math.round(words*60/seconds):null,checks,next};
}
export function guidance(category:string,profile:Profile,stories:Story[],question:string){
 const technical=category==='Technical'||category==='System design';
 const tokens=question.toLowerCase().split(/\W+/).filter(w=>w.length>4);
 const ranked=stories.map(s=>({s,n:tokens.filter(t=>(s.title+' '+s.tag+' '+s.action).toLowerCase().includes(t)).length})).sort((a,b)=>b.n-a.n);
 const story=ranked.find(x=>x.n>0)?.s;
 return {steps:technical?['Clarify inputs, constraints, and success criteria.','Explain a simple baseline before optimizing.','Walk through the design and the key trade-offs.','Test boundaries, failures, and operational behavior.']:category==='Negotiation'?['Express enthusiasm and clarify the full offer.','Explain your priorities using evidence.','Make a specific, respectful request.','Agree on a next step and timeline.']:['Set the context in one or two sentences.','Explain the goal you owned.','Describe your decisions and trade-offs.','Show the impact and what you learned.'],labels:technical?'PLAN':category==='Negotiation'?'ASKS':'STAR',story,context:profile.role?'Connect your example to '+profile.role+(profile.company?' at '+profile.company:'')+'.':'Add your role and resume to focus your preparation.'};
}
export const capabilities=[
{title:'Resume & job context',source:'Final Round AI',url:'https://www.finalroundai.com/frequently-asked-questions',detail:'Save your background and target role; use them in coaching and role-specific practice.'},
{title:'Mock interviews',source:'Teal',url:'https://www.tealhq.com/tools/ai-interview-practice',detail:'Practice a timed question sequence across seven interview formats.'},
{title:'Live transcription',source:'Teal',url:'https://www.tealhq.com/tools/ai-interview-practice',detail:'Opt-in browser speech recognition, editable transcripts, and typed input fallback.'},
{title:'Contextual answer guidance',source:'Final Round AI',url:'https://docs.finalroundai.com/docs/live-copilot/using-copilot',detail:'Question-aware frameworks, relevant saved stories, and optional AI coaching.'},
{title:'STAR answer builder',source:'Big Interview',url:'https://support.biginterview.com/en/article/the-answer-builder-17twbwl/',detail:'Build, edit, save, and reuse Situation, Task, Action, Result stories.'},
{title:'Technical & system design practice',source:'interviewing.io',url:'https://interviewing.io/',detail:'Technical prompts, design checklists, a solution editor, and optional AI review.'},
{title:'Delivery feedback',source:'Yoodli',url:'https://yoodli.ai/use-cases/interview-preparation',detail:'Word counts, filler counts, and measured speaking pace for voice answers.'},
{title:'Question library',source:'Big Interview',url:'https://www.biginterview.com/platform/practice-with-interview-simulator',detail:'Searchable questions, category filters, custom prompts, and role-specific prompts.'},
{title:'Post-session review',source:'Huru',url:'https://huru.ai/',detail:'Saved answers, transparent rubric checks, next-step feedback, and exports.'},
{title:'Progress tracking',source:'Teal',url:'https://help.tealhq.com/en/articles/10716253-interview-practice-hub',detail:'Actual session history and score trends, plus the next improvement to practice.'}
];
