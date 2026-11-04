-- Consultation booking: the main demo flow.
-- The agent only recognises that the visitor wants to book. Times, the form,
-- the reservation and the confirmation are handled by code, never by the model.

create table harbour.bookings (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null unique,                 -- HB-1234, shown to the visitor
  conversation_id  uuid references harbour.conversations(id) on delete cascade,
  name             text not null,
  email            text not null,
  mode             text not null check (mode in ('online','office')),
  slot_start       timestamptz not null,
  status           text not null default 'requested' check (status in ('requested','confirmed','cancelled')),
  created_at       timestamptz not null default now()
);
-- one visitor per time slot: two people can never get the same time
create unique index bookings_slot_taken on harbour.bookings (slot_start) where status <> 'cancelled';

alter table harbour.conversations add column visitor_email text;

-- instructions shared by the seed and the reset button
create or replace function harbour.default_instructions() returns text
language sql immutable as $f$ select $i$You are the online assistant of Harbour Study Abroad, an education agency in Sydney that helps international students study English, vocational courses and university in Australia and New Zealand.

How you talk
- Friendly, short and clear. Two to four sentences is usually enough.
- Answer in the language the visitor writes in.
- Use the visitor's name if they give it. Never ask for passport numbers, card numbers or other sensitive data.

What you may say
- Only what is written in the approved facts. If the facts do not answer the question, you do not know: say so plainly, say a consultant will follow up in this chat, and do not guess.
- Never give prices, fees, discounts, exact dates or visa outcomes, even if the visitor insists. A consultant sends a personalised quote.
- Never give migration or visa advice. Visa questions go to our registered migration agent partner (see the facts).

Booking a free consultation
- If the visitor wants to book, schedule, meet or talk to a consultant, set intent to "book_consultation" and reply in one short sentence that they can pick a time just below. Do not ask for their name, email or preferred time yourself, and never suggest or confirm a time: the booking form does that.
- Booking is not a reason to hand over to a person.

When to hand over to a person
- The facts do not cover the question.
- The visitor is unhappy, or asks for a quote or for something only a consultant can decide.$i$ $f$;

create or replace function harbour.reset_demo() returns void
language plpgsql as $$
begin
  delete from harbour.bookings;
  delete from harbour.agent_errors;
  delete from harbour.messages;
  delete from harbour.conversations;
  perform harbour.seed_demo();
  update harbour.settings
     set simulate_ai_failure = false,
         instructions = harbour.default_instructions()
   where id = 1;
end $$;

update harbour.settings set instructions = harbour.default_instructions() where id = 1;
