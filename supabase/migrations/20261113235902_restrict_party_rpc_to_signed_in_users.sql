revoke execute on function public.gather_party_list() from anon;
revoke execute on function public.gather_party_create(text,uuid[]) from anon;
revoke execute on function public.gather_party_invite(uuid,uuid[]) from anon;
revoke execute on function public.gather_party_join(uuid) from anon;
revoke execute on function public.gather_party_leave(uuid) from anon;
revoke execute on function public.gather_party_close(uuid) from anon;
revoke execute on function public.gather_party_poll_create(uuid,text,text[]) from anon;
revoke execute on function public.gather_party_poll_vote(uuid,integer) from anon;