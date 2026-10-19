-- Widens properties.property_type to cover the full set of Danish "boligtype"
-- categories the search filter now exposes (villa, rækkehus, ejerlejlighed,
-- villalejlighed, fritidsbolig, andelsbolig, landejendom, fritidsgrund,
-- helårsgrund, husbåd) rather than the original six-value subset. Existing
-- rows are unaffected — every prior value stays valid; this only adds new
-- allowed values to the CHECK constraint.

alter table public.properties
  drop constraint properties_property_type_check;

alter table public.properties
  add constraint properties_property_type_check
  check (property_type in (
    'villa',
    'apartment',
    'terraced_house',
    'summer_house',
    'farm',
    'villa_apartment',
    'cooperative',
    'holiday_plot',
    'residential_plot',
    'houseboat',
    'other'
  ));
