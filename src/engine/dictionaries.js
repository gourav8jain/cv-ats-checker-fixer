// Word lists used by the analyzer and fixer. Kept plain so they are easy to extend.

export const SECTION_SYNONYMS = {
  summary: ['summary', 'professional summary', 'profile', 'professional profile', 'about me', 'about', 'objective', 'career objective', 'career summary', 'executive summary', 'overview', 'personal statement'],
  experience: ['experience', 'work experience', 'professional experience', 'employment', 'employment history', 'work history', 'career history', 'relevant experience', 'professional background', 'experience summary'],
  education: ['education', 'academic background', 'academics', 'education and training', 'qualifications', 'academic qualifications', 'educational background'],
  skills: ['skills', 'technical skills', 'core skills', 'key skills', 'core competencies', 'competencies', 'areas of expertise', 'expertise', 'skills & tools', 'skills and tools', 'tools', 'technologies', 'tech stack', 'skill set', 'skillset'],
  projects: ['projects', 'key projects', 'personal projects', 'selected projects', 'project experience', 'academic projects'],
  certifications: ['certifications', 'certificates', 'licenses', 'licenses & certifications', 'licenses and certifications', 'certifications & training', 'training', 'courses'],
  awards: ['awards', 'honors', 'honours', 'achievements', 'awards & honors', 'accomplishments', 'key achievements'],
  publications: ['publications', 'papers', 'research'],
  volunteer: ['volunteer', 'volunteering', 'volunteer experience', 'community involvement'],
  languages: ['languages', 'language skills'],
  interests: ['interests', 'hobbies', 'hobbies & interests', 'activities'],
  references: ['references', 'referees'],
};

export const CANONICAL_TITLES = {
  summary: 'Professional Summary',
  experience: 'Work Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  awards: 'Awards',
  publications: 'Publications',
  volunteer: 'Volunteer Experience',
  languages: 'Languages',
  interests: 'Interests',
  references: 'References',
};

export const SECTION_ORDER = ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'awards', 'publications', 'volunteer', 'languages', 'interests', 'references'];

export const ACTION_VERBS = new Set(`accelerated achieved acquired adapted addressed administered advanced advised advocated analyzed analysed applied appointed architected arranged assembled assessed audited authored automated balanced benchmarked boosted briefed budgeted built calculated campaigned captured catalogued centralized chaired championed charted clarified closed coached collaborated combined commissioned communicated compiled completed composed computed conceived conceptualized condensed conducted configured consolidated constructed consulted contracted contributed controlled converted convinced coordinated corrected counseled crafted created cultivated curated customized cut debugged decreased defined delegated delivered demonstrated deployed designed detected determined developed devised diagnosed directed discovered dispatched documented doubled drafted drove earned edited educated eliminated enabled encouraged engineered enhanced ensured established estimated evaluated examined exceeded executed expanded expedited experimented explained explored facilitated finalized forecasted formalized formed formulated fostered founded generated governed grew guided halved handled headed hired identified implemented improved increased influenced informed initiated innovated inspected installed instituted instructed integrated interpreted interviewed introduced invented investigated launched led leveraged liaised maintained managed mapped marketed maximized measured mediated mentored merged migrated minimized mobilized modeled modelled modernized monitored motivated navigated negotiated onboarded operated optimized orchestrated organized originated outperformed overhauled oversaw partnered persuaded piloted pioneered planned prepared presented prevented prioritized processed procured produced programmed projected promoted proposed prototyped proved provided published purchased qualified quantified raised ranked rebuilt received recommended reconciled recruited redesigned reduced refactored refined regulated rehabilitated reinforced remodeled reorganized repaired replaced reported represented researched resolved restored restructured revamped reviewed revised revitalized saved scaled scheduled scoped screened secured selected served shaped shipped simplified sold solved spearheaded specified sponsored standardized steered streamlined strengthened structured succeeded summarized supervised supported surpassed surveyed sustained synthesized systematized targeted taught tested tracked trained transformed translated tripled troubleshot uncovered unified upgraded utilized validated verified won wrote`.split(/\s+/));

// Weak openers -> stronger replacement verb (past tense)
export const WEAK_PHRASES = [
  [/^(was |were )?responsible for (the )?(managing|management of)\s+/i, 'Managed '],
  [/^(was |were )?responsible for (the )?(leading)\s+/i, 'Led '],
  [/^(was |were )?responsible for (the )?(developing|development of)\s+/i, 'Developed '],
  [/^(was |were )?responsible for (the )?(creating|creation of)\s+/i, 'Created '],
  [/^(was |were )?responsible for (the )?(handling)\s+/i, 'Handled '],
  [/^(was |were )?responsible for (the )?(maintaining|maintenance of)\s+/i, 'Maintained '],
  [/^(was |were )?responsible for (the )?(testing)\s+/i, 'Tested '],
  [/^(was |were )?responsible for (the )?(coordinating|coordination of)\s+/i, 'Coordinated '],
  [/^(was |were )?responsible for\s+/i, 'Owned '],
  [/^(was |were )?in charge of\s+/i, 'Directed '],
  [/^duties (included|include)\s+/i, 'Handled '],
  [/^tasked with\s+/i, 'Delivered '],
  [/^(i )?(helped|assisted)( to| in| with)?\s+/i, 'Supported '],
  [/^(i )?worked on\s+/i, 'Built '],
  [/^(i )?worked with\s+/i, 'Partnered with '],
  [/^(i )?was involved (in|with)\s+/i, 'Contributed to '],
  [/^(i )?participated in\s+/i, 'Contributed to '],
  [/^(i )?took part in\s+/i, 'Contributed to '],
  [/^(i )?did\s+/i, 'Executed '],
  [/^(i )?made\s+/i, 'Created '],
  [/^(i )?got\s+/i, 'Earned '],
  [/^(i )?used\s+/i, 'Leveraged '],
  [/^(i )?handled\s+/i, 'Managed '],
  [/^(i )?dealt with\s+/i, 'Resolved '],
  [/^(i )?tried to\s+/i, ''],
];

export const WEAK_DETECT = /^(was |were )?(responsible for|in charge of|duties included|tasked with|helped|assisted|worked on|worked with|was involved|participated in|took part in|did |made |got |dealt with|tried to)/i;

export const CLICHES = {
  'team player': 'collaborative',
  'hard worker': '',
  'hard-working': '',
  'hardworking': '',
  'go-getter': '',
  'self-starter': 'self-directed',
  'detail-oriented': 'meticulous',
  'detail oriented': 'meticulous',
  'results-driven': '',
  'results driven': '',
  'results-oriented': '',
  'think outside the box': 'solve problems creatively',
  'thinking outside the box': 'creative problem solving',
  'synergy': 'collaboration',
  'go-to person': 'trusted lead',
  'dynamic': '',
  'motivated': '',
  'highly motivated': '',
  'passionate': '',
  'proven track record': 'record',
  'excellent communication skills': 'clear communication',
  'strong work ethic': '',
  'best of breed': 'leading',
  'value add': 'value',
  'value-add': 'value',
  'track record': 'record',
  'dynamic individual': 'professional',
  'out of the box': 'creative',
  'fast-paced environment': 'high-velocity teams',
  'fast paced environment': 'high-velocity teams',
  'wear many hats': 'cover multiple roles',
  'ninja': 'expert',
  'rockstar': 'expert',
  'guru': 'expert',
};

export const PRONOUNS = /\b(I|me|my|mine|myself|we|our|us)\b/g;

export const STOPWORDS = new Set(`a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves etc via per also within across able ability including include includes using use used new well work working job role candidate candidates looking join team company opportunity position experience years year strong excellent good great knowledge understanding must required requirements preferred plus responsibilities responsible duties ideal skills skill based related relevant across environment day days time make sure apply applicants equal employer benefits salary office remote hybrid location full part we're you'll you're it's they're can't will be other others like such need needs want wants help support ensure provide providing`.split(/\s+/));

// A compact skills dictionary used to recognise hard skills in resumes and job descriptions.
export const KNOWN_SKILLS = `javascript, typescript, python, java, kotlin, swift, golang, rust, ruby, php, scala, c++, c#, .net, matlab, sql, nosql, html, css, sass, react, react native, next.js, vue, angular, svelte, node.js, express, django, flask, fastapi, spring, spring boot, laravel, rails, graphql, rest api, apis, microservices, docker, kubernetes, terraform, ansible, jenkins, github actions, gitlab ci, ci/cd, aws, azure, gcp, google cloud, lambda, s3, ec2, cloudformation, serverless, linux, bash, git, jira, confluence, agile, scrum, kanban, tdd, bdd, selenium, cypress, playwright, appium, jest, mocha, pytest, junit, testng, postman, jmeter, k6, loadrunner, owasp, vapt, penetration testing, pci dss, pci-dss, iso 27001, soc 2, gdpr, hipaa, sox, risk management, compliance, audit, siem, splunk, elk, elasticsearch, kibana, grafana, prometheus, datadog, new relic, kafka, rabbitmq, redis, postgresql, postgres, mysql, mongodb, dynamodb, cassandra, oracle, snowflake, bigquery, redshift, databricks, spark, hadoop, airflow, dbt, etl, data modeling, data analysis, data visualization, tableau, power bi, looker, excel, pandas, numpy, scikit-learn, tensorflow, pytorch, keras, machine learning, deep learning, nlp, computer vision, llm, generative ai, prompt engineering, statistics, a/b testing, product management, roadmap, stakeholder management, okrs, kpis, project management, pmp, prince2, six sigma, lean, budgeting, forecasting, financial modeling, accounting, gaap, ifrs, payroll, crm, salesforce, hubspot, sap, erp, seo, sem, google analytics, content marketing, social media, copywriting, email marketing, figma, sketch, photoshop, illustrator, ux, ui, user research, wireframing, prototyping, customer success, account management, business development, negotiation, sales, lead generation, recruiting, talent acquisition, onboarding, coaching, mentoring, leadership, people management, communication, public speaking, problem solving, critical thinking, cross-functional collaboration, payments, fintech, kyc, aml, fraud detection, reconciliation, treasury, open banking, iso 20022, blockchain, solidity, android, ios, flutter, xamarin, unity, embedded, iot, networking, tcp/ip, dns, firewall, vpn, active directory, itil, servicenow, devops, sre, observability, incident management, performance testing, security testing, api testing, automation testing, manual testing, regression testing, quality assurance, qa, test strategy, test planning`.split(/,\s*/).filter(Boolean);

export const SKILL_PHRASES = [...new Set(KNOWN_SKILLS)].sort((a, b) => b.length - a.length);

export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Present tense / gerund -> past tense for common verbs at bullet start.
export const TENSE_MAP = {
  manage: 'managed', manages: 'managed', managing: 'managed',
  lead: 'led', leads: 'led', leading: 'led',
  develop: 'developed', develops: 'developed', developing: 'developed',
  build: 'built', builds: 'built', building: 'built',
  create: 'created', creates: 'created', creating: 'created',
  design: 'designed', designs: 'designed', designing: 'designed',
  drive: 'drove', drives: 'drove', driving: 'drove',
  own: 'owned', owns: 'owned', owning: 'owned',
  run: 'ran', runs: 'ran', running: 'ran',
  write: 'wrote', writes: 'wrote', writing: 'wrote',
  oversee: 'oversaw', oversees: 'oversaw', overseeing: 'oversaw',
  implement: 'implemented', implements: 'implemented', implementing: 'implemented',
  coordinate: 'coordinated', coordinates: 'coordinated', coordinating: 'coordinated',
  support: 'supported', supports: 'supported', supporting: 'supported',
  maintain: 'maintained', maintains: 'maintained', maintaining: 'maintained',
  analyze: 'analyzed', analyzes: 'analyzed', analyzing: 'analyzed',
  deliver: 'delivered', delivers: 'delivered', delivering: 'delivered',
  improve: 'improved', improves: 'improved', improving: 'improved',
  test: 'tested', tests: 'tested', testing: 'tested',
  mentor: 'mentored', mentors: 'mentored', mentoring: 'mentored',
  train: 'trained', trains: 'trained', training: 'trained',
  plan: 'planned', plans: 'planned', planning: 'planned',
  conduct: 'conducted', conducts: 'conducted', conducting: 'conducted',
  ensure: 'ensured', ensures: 'ensured', ensuring: 'ensured',
  handle: 'handled', handles: 'handled', handling: 'handled',
  prepare: 'prepared', prepares: 'prepared', preparing: 'prepared',
  collaborate: 'collaborated', collaborates: 'collaborated', collaborating: 'collaborated',
  work: 'worked', works: 'worked', working: 'worked',
  establish: 'established', establishes: 'established', establishing: 'established',
  define: 'defined', defines: 'defined', defining: 'defined',
  automate: 'automated', automates: 'automated', automating: 'automated',
  monitor: 'monitored', monitors: 'monitored', monitoring: 'monitored',
  review: 'reviewed', reviews: 'reviewed', reviewing: 'reviewed',
  report: 'reported', reports: 'reported', reporting: 'reported',
  hire: 'hired', hires: 'hired', hiring: 'hired',
  sell: 'sold', sells: 'sold', selling: 'sold',
  teach: 'taught', teaches: 'taught', teaching: 'taught',
  reduce: 'reduced', reduces: 'reduced', reducing: 'reduced',
  increase: 'increased', increases: 'increased', increasing: 'increased',
  launch: 'launched', launches: 'launched', launching: 'launched',
  optimize: 'optimized', optimizes: 'optimized', optimizing: 'optimized',
  negotiate: 'negotiated', negotiates: 'negotiated', negotiating: 'negotiated',
  partner: 'partnered', partners: 'partnered', partnering: 'partnered',
  architect: 'architected', architects: 'architected', architecting: 'architected',
  spearhead: 'spearheaded', spearheads: 'spearheaded', spearheading: 'spearheaded',
  resolve: 'resolved', resolves: 'resolved', resolving: 'resolved',
  provide: 'provided', provides: 'provided', providing: 'provided',
  execute: 'executed', executes: 'executed', executing: 'executed',
  deploy: 'deployed', deploys: 'deployed', deploying: 'deployed',
  migrate: 'migrated', migrates: 'migrated', migrating: 'migrated',
  scale: 'scaled', scales: 'scaled', scaling: 'scaled',
};

// Synonym rotation for over-used verbs.
export const VERB_SYNONYMS = {
  managed: ['Oversaw', 'Directed', 'Ran', 'Supervised', 'Administered'],
  led: ['Spearheaded', 'Headed', 'Directed', 'Steered', 'Championed'],
  developed: ['Built', 'Engineered', 'Created', 'Designed', 'Produced'],
  created: ['Built', 'Designed', 'Launched', 'Established', 'Produced'],
  built: ['Engineered', 'Developed', 'Assembled', 'Constructed', 'Created'],
  improved: ['Enhanced', 'Strengthened', 'Optimized', 'Upgraded', 'Elevated'],
  worked: ['Partnered', 'Collaborated', 'Engaged', 'Operated', 'Served'],
  supported: ['Enabled', 'Assisted', 'Backed', 'Facilitated', 'Sustained'],
  implemented: ['Executed', 'Deployed', 'Rolled out', 'Introduced', 'Instituted'],
  designed: ['Architected', 'Crafted', 'Devised', 'Shaped', 'Planned'],
  coordinated: ['Orchestrated', 'Organized', 'Aligned', 'Synchronized', 'Arranged'],
  increased: ['Grew', 'Boosted', 'Raised', 'Expanded', 'Accelerated'],
  reduced: ['Cut', 'Lowered', 'Decreased', 'Trimmed', 'Minimized'],
  owned: ['Drove', 'Led', 'Directed', 'Ran', 'Headed'],
  handled: ['Managed', 'Resolved', 'Processed', 'Addressed', 'Directed'],
  delivered: ['Shipped', 'Launched', 'Completed', 'Produced', 'Executed'],
};
