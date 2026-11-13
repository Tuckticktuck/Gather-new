alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
check (kind = any (array[
 'message'::text,'friend_request'::text,'chat_request'::text,'feedback_reply'::text,
 'report'::text,'announcement'::text,'uno_invite'::text,'uno_rematch'::text,'uno_rematch_result'::text
]));