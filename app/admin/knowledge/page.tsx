import { requireAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import Shell from '../shell';
import { addFact, saveFact, toggleFact } from '../actions';

export const dynamic = 'force-dynamic';

type Fact = { code: string; topic: string; title: string; content: string; approved: boolean; updated_at: string };

export default async function Knowledge() {
  await requireAdmin();
  const facts = (await db().query<Fact>('select code, topic, title, content, approved, updated_at from harbour.facts order by approved desc, code')).rows;
  const approved = facts.filter((f) => f.approved).length;
  return (
    <Shell active="/admin/knowledge">
      <div className="page-head">
        <div>
          <h1>Knowledge</h1>
          <p className="muted">The agent answers <b>only</b> from approved facts ({approved} of {facts.length}). Drafts are invisible to it. Every answer cites the fact codes it used, and the workflow rejects any code that is not approved.</p>
        </div>
      </div>

      <details className="card-box add">
        <summary>+ Add a fact (starts as a draft)</summary>
        <form action={addFact} className="fact-form">
          <input name="title" placeholder="Title, e.g. Student visa work rights" required maxLength={120} />
          <input name="topic" placeholder="Topic, e.g. visa" required maxLength={60} />
          <textarea name="content" rows={3} placeholder="The exact information the agent may say" required maxLength={2000} />
          <button className="btn">Add as draft</button>
        </form>
      </details>

      <ul className="facts">
        {facts.map((f) => (
          <li key={f.code} className={f.approved ? '' : 'draft'}>
            <details>
              <summary>
                <code>{f.code}</code>
                <span className="f-title">{f.title}</span>
                <span className="f-topic">{f.topic}</span>
                <span className={`pill ${f.approved ? 'green' : 'grey'}`}>{f.approved ? 'Approved' : 'Draft'}</span>
              </summary>
              <form action={saveFact} className="fact-form">
                <input type="hidden" name="code" value={f.code} />
                <input name="title" defaultValue={f.title} required maxLength={120} />
                <input name="topic" defaultValue={f.topic} required maxLength={60} />
                <textarea name="content" defaultValue={f.content} rows={3} required maxLength={2000} />
                <div className="row-btns">
                  <button className="btn">Save</button>
                </div>
              </form>
              <form action={toggleFact} className="toggle-fact">
                <input type="hidden" name="code" value={f.code} />
                <button className="ghost-btn">{f.approved ? 'Move back to draft' : 'Approve: the agent can use it'}</button>
              </form>
            </details>
            <p className="f-content">{f.content}</p>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
