-- Eksport af nuværende annoncer i postnummer 9000 til scoring (Fase 4).
-- Kørt mod Supabase-projektet bolig-data den 2026-11-02 med kun læseadgang.
-- Ingen adresser eller links eksporteres. lid er et løbenummer og kan ikke kobles til sales-eksportens pid.
-- Bemærk: concat_ws springer NULL over og forskyder kolonner. Alle nullbare felter skal derfor coalesces.
-- listing_date er udeladt bevidst: den er NULL for en stor del af annoncerne og bruges ikke af scoringen.
select count(*) n,
       'lid,asking,pt,sqm,rooms,year,lat,lon' || E'\n' ||
       string_agg(concat_ws(',', lid, price::bigint, property_type, sqm,
                  coalesce(rooms::text, ''), coalesce(building_year::text, ''),
                  round(lat::numeric, 4), round(lon::numeric, 4)), E'\n' order by lid) csv
from (
  select dense_rank() over (order by id) lid, price, property_type, sqm, rooms, building_year, lat, lon
  from properties
  where postal_code = '9000' and status = 'active'
    and property_type in ('villa', 'terraced_house', 'villa_apartment', 'apartment')
) l;
