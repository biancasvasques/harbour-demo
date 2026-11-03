-- Harbour Study Abroad — invented company, invented facts. Nothing here is real.
--
-- seed_demo()  : puts settings and facts back to the original demo state.
-- reset_demo() : deletes every conversation, message and error, then seeds.
--                Called by the "Reset demo" button in the panel.

create or replace function public.seed_demo() returns void
language plpgsql as $$
begin
  delete from public.facts;
  delete from public.settings;

  insert into public.settings (id, agent_enabled, instructions, timezone, business_hours,
                               after_hours_notice, fallback_message, handoff_message)
  values (
    1, true,
$i$You are the online assistant of Harbour Study Abroad, an education agency in Sydney that helps international students study English, vocational courses and university in Australia and New Zealand.

How you talk
- Friendly, short and clear. Two to four sentences is usually enough.
- Answer in the language the visitor writes in.
- Use the visitor's name if they give it. Never ask for passport numbers, card numbers or other sensitive data.

What you may say
- Only what is written in the approved facts. If the facts do not answer the question, you do not know: say so plainly, say a consultant will reply in this chat, and do not guess.
- Never give prices, fees, discounts, exact dates or visa outcomes, even if the visitor insists. A consultant sends a personalised quote.
- Never give migration or visa advice. Visa questions go to our registered migration agent partner (see the facts).

When to hand over to a person
- The facts do not cover the question.
- The visitor asks for a person, wants a quote, wants to book, or is unhappy.$i$,
    'Australia/Sydney',
    '{"1":["09:00","17:30"],"2":["09:00","17:30"],"3":["09:00","17:30"],"4":["09:00","17:30"],"5":["09:00","17:00"]}'::jsonb,
    'Our team is offline right now. Office hours are Monday to Thursday 9am to 5:30pm and Friday 9am to 5pm (Sydney time). A consultant will reply on the next business day.',
    'Sorry, I am having a technical problem and could not answer just now. Your message is saved and a consultant will reply in this chat as soon as possible.',
    'Good question. I do not have that information, so I have passed your message to a consultant, who will reply right here in this chat.'
  );

  insert into public.facts (code, topic, title, content, approved) values
  ('F01','About us','Who we are',
   'Harbour Study Abroad is an education agency based in Sydney, founded in 2014. We help international students choose and enrol in English courses, vocational (VET) courses and university programs in Australia and New Zealand.', true),
  ('F02','About us','Office location',
   'Our office is at Level 4, 120 Harbour Street, Sydney NSW 2000 (invented address for this demo). Visits are by appointment.', true),
  ('F03','About us','Office hours',
   'Monday to Thursday 9am to 5:30pm and Friday 9am to 5pm, Sydney time. We are closed on weekends and NSW public holidays.', true),
  ('F04','Services','Cost of our service',
   'Our consultation and enrolment service is free for students. We are paid by the partner schools. Course fees are paid to the school.', true),
  ('F05','Services','Free consultation',
   'Students can book a free 30-minute consultation, online or at the office. A consultant confirms the time by email.', true),
  ('F06','Destinations','Where we work',
   'We place students in Australia (Sydney, Melbourne, Brisbane, Gold Coast and Perth) and New Zealand (Auckland and Wellington).', true),
  ('F07','English courses','English course length',
   'English courses start from 4 weeks. Most schools have new start dates every Monday. Full-time courses are 20 hours of class per week.', true),
  ('F08','English courses','English levels',
   'Courses are available from beginner to advanced, plus IELTS and Cambridge exam preparation. Schools test the student''s level on the first day.', true),
  ('F09','Vocational courses','VET courses',
   'We work with vocational colleges offering certificates and diplomas in business, hospitality, IT, marketing and early childhood education. Diplomas usually take 12 to 18 months.', true),
  ('F10','University','University pathways',
   'We help with undergraduate and postgraduate applications and with foundation and pathway programs for students who do not yet meet direct entry requirements.', true),
  ('F11','Applications','When to apply',
   'We recommend starting 8 to 12 weeks before the course start, because school enrolment and visa processing take time.', true),
  ('F12','Applications','Documents to start',
   'To start an application we usually need a copy of the passport, academic transcripts and, for some courses, an English test result. The consultant confirms the exact list for each course.', true),
  ('F13','Visas','Visa advice',
   'Harbour Study Abroad does not give migration advice. Visa questions are handled by our partner, a registered migration agent, and we can book a session with them.', true),
  ('F14','Health insurance','Health cover',
   'Student visa holders in Australia need Overseas Student Health Cover (OSHC) for their whole stay. We can help compare providers.', true),
  ('F15','Accommodation','Accommodation options',
   'We can arrange homestay with a local family, student residences or shared apartments. Homestay usually includes some meals.', true),
  ('F16','Arrival','Airport pickup',
   'Airport pickup can be booked through the school or the homestay provider for students arriving in Australia or New Zealand.', true),
  ('F17','Under 18','Students under 18',
   'Students under 18 can study with us, but schools require approved welfare and accommodation arrangements and parental consent.', true),
  ('F18','Payments','How fees are paid',
   'Course fees are paid directly to the school, usually by bank transfer or card. We never ask for payment through this chat.', true),
  ('F19','Support','Support after arrival',
   'Our students can contact us during their course for help with course changes, extensions and general questions.', true),
  ('F20','Languages','Languages we speak',
   'Our consultants speak English, Portuguese and Spanish.', true),
  -- NOT approved: the agent must never use these.
  ('F21','Promotions','Scholarship (draft)',
   'All students who enrol in a Canadian program this month get a 20% scholarship.', false),
  ('F22','About us','Saturday opening (draft)',
   'The office is open on Saturdays from 10am to 2pm.', false),
  ('F23','Promotions','Free airport pickup (draft)',
   'Airport pickup is free for every student.', false);
end $$;

create or replace function public.reset_demo() returns void
language plpgsql as $$
begin
  delete from public.agent_errors;
  delete from public.messages;
  delete from public.conversations;
  perform public.seed_demo();
end $$;

select public.seed_demo();
