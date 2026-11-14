grant execute on function private.request_my_age_change(date) to authenticated;
grant execute on function private.my_age_change_status() to authenticated;
grant execute on function private.admin_list_age_change_requests() to authenticated;
grant execute on function private.admin_review_age_change_request(uuid,boolean) to authenticated;