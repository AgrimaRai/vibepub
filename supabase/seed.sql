-- Local development only. Replace QR tokens for every real venue.
insert into public.venues(id,name) values('10000000-0000-4000-8000-000000000001','The Midnight Social');
insert into public.venue_tables(venue_id,label,qr_token) values('10000000-0000-4000-8000-000000000001','07','70000000-0000-4000-8000-000000000007'),('10000000-0000-4000-8000-000000000001','12','70000000-0000-4000-8000-000000000012');
insert into public.sessions(id,venue_id,name) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','After hours · DJ Nova');
-- A shared entrance/bar QR: guests without a table join the Pub floor team.
insert into public.venue_tables(venue_id,label,qr_token) values('10000000-0000-4000-8000-000000000001','Pub floor','70000000-0000-4000-8000-000000000000');
