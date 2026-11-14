revoke all on function private.gather_tag_create(uuid,text,text,uuid[],text,integer),
 private.gather_tag_join(uuid,text),private.gather_tag_customize(uuid,text),
 private.gather_tag_ready(uuid,boolean),private.gather_tag_start(uuid),
 private.gather_tag_leave(uuid),private.gather_tag_move(uuid,numeric,numeric),
 private.gather_tag_end(uuid)
 from public,anon;
revoke all on function public.gather_tag_create(uuid,text,text,uuid[],text,integer),
 public.gather_tag_join(uuid,text),public.gather_tag_customize(uuid,text),
 public.gather_tag_ready(uuid,boolean),public.gather_tag_start(uuid),
 public.gather_tag_leave(uuid),public.gather_tag_move(uuid,numeric,numeric),
 public.gather_tag_end(uuid)
 from public,anon;
grant execute on function private.gather_tag_create(uuid,text,text,uuid[],text,integer),
 private.gather_tag_join(uuid,text),private.gather_tag_customize(uuid,text),
 private.gather_tag_ready(uuid,boolean),private.gather_tag_start(uuid),
 private.gather_tag_leave(uuid),private.gather_tag_move(uuid,numeric,numeric),
 private.gather_tag_end(uuid)
 to authenticated;
grant execute on function public.gather_tag_create(uuid,text,text,uuid[],text,integer),
 public.gather_tag_join(uuid,text),public.gather_tag_customize(uuid,text),
 public.gather_tag_ready(uuid,boolean),public.gather_tag_start(uuid),
 public.gather_tag_leave(uuid),public.gather_tag_move(uuid,numeric,numeric),
 public.gather_tag_end(uuid)
 to authenticated;
