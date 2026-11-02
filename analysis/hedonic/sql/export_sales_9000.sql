-- Eksport af handler for postnummer 9000 siden 2011-01-01 (rå, ufiltreret ud over boligtype og dato).
-- Kørt mod Supabase-projektet bolig-data den 2026-11-02 med kun læseadgang.
-- Ingen adresser eller ejeroplysninger eksporteres. Boligerne identificeres kun ved et løbenummer (pid).
-- Offentlig vurdering: seneste vurdering hvor registered_at <= handelsdato (kun viden fra salgstidspunktet).
with p as (
  select id, property_type, sqm, rooms, building_year, lat, lon, bfe_nummer,
         dense_rank() over (order by id) pid
  from properties
  where postal_code = '9000'
    and property_type in ('villa', 'terraced_house', 'villa_apartment', 'apartment')
),
r as (
  select p.pid, st.sold_date, st.sale_price, st.sale_type, p.property_type pt, p.sqm, p.rooms,
         p.building_year, p.lat, p.lon, st.residential_area, st.area_as_of,
         (select v.assessed_property_value_dkk from property_valuations v
           where v.bfe_nummer = p.bfe_nummer and v.registered_at <= st.sold_date::timestamptz
             and v.assessed_property_value_dkk is not null
           order by v.valuation_year desc limit 1) vur,
         (select v.valuation_year from property_valuations v
           where v.bfe_nummer = p.bfe_nummer and v.registered_at <= st.sold_date::timestamptz
             and v.assessed_property_value_dkk is not null
           order by v.valuation_year desc limit 1) vury
  from sale_transactions st join p on p.id = st.property_id
  where st.sold_date >= '2011-01-01'
)
select count(*) n,
       'pid,sold_date,price,sale_type,pt,sqm,rooms,year,lat,lon,resarea,area_as_of,vur,vury' || E'\n' ||
       string_agg(concat_ws(',', pid, sold_date, sale_price::bigint, sale_type, pt, sqm,
                  coalesce(rooms::text, ''), coalesce(building_year::text, ''),
                  round(lat::numeric, 4), round(lon::numeric, 4),
                  coalesce(residential_area::text, ''), coalesce(area_as_of::text, ''),
                  coalesce(vur::text, ''), coalesce(vury::text, '')), E'\n' order by sold_date, pid) csv
from r;
