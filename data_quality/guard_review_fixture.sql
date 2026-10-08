-- Local fixture regression copied from the 75 production-observed product
-- names in the read-only review set. It reads no production data.
create temporary table dq01_guard_names(
  canonical text,
  name text,
  category text,
  canonical_id bigint generated always as (
    case canonical
      when 'Canned Tuna' then 27
      when 'Canned Salmon' then 236
    end
  ) stored
);

insert into dq01_guard_names(canonical, name, category) values
('Canned Tuna','StarKist Tuna, Chunk Light','SEAFOOD'),
('Canned Tuna','Chicken of the Sea Chunk Light Tuna in Water','SEAFOOD'),
('Canned Tuna','Bumble Bee Albacore Solid White in Water Tuna','SEAFOOD'),
('Canned Tuna','Bumble Bee® Solid White Albacore Tuna in Water','SEAFOOD'),
('Canned Tuna','StarKist® Solid White Albacore Tuna in Water Can','SEAFOOD'),
('Canned Tuna','Bumble Bee Solid White Albacore Tuna in Water','SEAFOOD'),
('Canned Tuna','StarKist Tuna, Chunk Light, 4 Pack','SEAFOOD'),
('Canned Tuna','StarKist Chunk Light Tuna in Water','SEAFOOD'),
('Canned Tuna','StarKist® Chunk Light Tuna in Water Can','SEAFOOD'),
('Canned Tuna','Kroger® Wild Caught Chunk Light Tuna in Water','SEAFOOD'),
('Canned Tuna','Wild Planet Wild Tuna, No Salt Added, Albacore','SEAFOOD'),
('Canned Tuna','Northern Catch Zesty Lemon Pepper Chunk Light Tuna in Water Pouch','SEAFOOD'),
('Canned Tuna','Northern Catch Solid White Tuna in Water','SEAFOOD'),
('Canned Tuna','Northern Catch Sweet and Spicy Chunk Light Tuna in Water Pouch','SEAFOOD'),
('Canned Tuna','Northern Catch Original Chunk Light Tuna in Water Pouch','SEAFOOD'),
('Canned Tuna','Northern Catch Chunk Light Tuna in Water','SEAFOOD'),
('Canned Tuna','Northern Catch Skipjack Chunk Light Tuna in Water','SEAFOOD'),
('Canned Tuna','Wild Planet Wild Tuna, Albacore','SEAFOOD'),
('Canned Tuna','StarKist Tuna, Albacore, Solid White','SEAFOOD'),
('Canned Tuna','StarKist Albacore Tuna, Solid White','SEAFOOD'),
('Canned Tuna','StarKist Tuna, Albacore, Solid White, 4 Pack','SEAFOOD'),
('Canned Tuna','Bumble Bee Chunk Light Tuna','SEAFOOD'),
('Canned Tuna','Safe Catch Elite Wild Tuna, Mercury-Tested','SEAFOOD'),
('Canned Tuna','Chicken of the Sea Chunk Light Tuna In Water 4 - 5 oz Cans','SEAFOOD'),
('Canned Tuna','Chicken of the Sea Chunk Light Tuna In Water','SEAFOOD'),
('Canned Tuna','365 By Whole Foods Market, No Salt Albacore Tuna In Water 6Pk, 5 Oz','SEAFOOD'),
('Canned Tuna','No Salt Added Albacore Tuna in Water, 5 OZ','SEAFOOD'),
('Canned Tuna','No Salt Added Wild Albacore Tuna, 5 OZ','SEAFOOD'),
('Canned Tuna','Wild Albacore Tuna, 5 OZ','SEAFOOD'),
('Canned Tuna','Albacore Tuna in Water No Salt Added, 5 OZ','SEAFOOD'),
('Canned Tuna','Skipjack Tuna in Water No Salt Added 6pk, 5 OZ','SEAFOOD'),
('Canned Tuna','Skipjack Tuna in Water No Salt Added, 5 OZ','SEAFOOD'),
('Canned Tuna','Salted Skipjack Tuna in Water, 5 OZ','SEAFOOD'),
('Canned Tuna','Safe Catch Ahi Wild Yellowfin Tuna Steaks, 5 oz, 6-count','SEAFOOD'),
('Canned Tuna','Kirkland Signature, Albacore Solid White Tuna in Water, 7 oz, 8-Count','SEAFOOD'),
('Canned Tuna','Yellowfin Tuna Fillets In EVOO, 4.4 OZ','SEAFOOD'),
('Canned Tuna','Wild Planet, Albacore Wild Tuna, 5 oz, 6-count','SEAFOOD'),
('Canned Tuna','Chicken of the Sea, Chunk Light Premium Tuna in Water, 7 oz, 12-Count','SEAFOOD'),
('Canned Tuna','Wild Planet Skipjack Wild Tuna','SEAFOOD'),
('Canned Tuna','Spicy Yellowfin Tuna Filets in EVOO, 4.4 OZ','SEAFOOD'),
('Canned Tuna','Albacore Tuna in Water, 5 OZ','SEAFOOD'),
('Canned Tuna','Albacore Tuna with Spanish Lemon, 3.2 OZ','SEAFOOD'),
('Canned Tuna','Unsalted Skipjack Tuna in Water, 5 OZ','SEAFOOD'),
('Canned Tuna','Wild Planet Albacore Wild Tuna','SEAFOOD'),
('Canned Tuna','Wild Albacore Tuna 4ct, 20 OZ','SEAFOOD'),
('Canned Tuna','Skipjack Tuna In Water No Salt Added 3pk, 5 OZ','SEAFOOD'),
('Canned Tuna','Good & Gather Solid White Albacore Tuna In Water','SEAFOOD'),
('Canned Tuna','Good & Gather Sweet & Spicy Chunk Light Tuna','SEAFOOD'),
('Canned Tuna','TUNA SOLID WHITE LONG LINE 24/5OZ/CASE-KROGER (EACH)','SEAFOOD'),
('Canned Tuna','Safe Catch Elite Pure Wild Tuna','SEAFOOD'),
('Canned Tuna','Good & Gather Chunk Light Tuna In Water','SEAFOOD'),
('Canned Tuna','Good & Gather Chunk Light Sustainably Caught Tuna In Water','SEAFOOD'),
('Canned Salmon','Northern Catch Pink Salmon','SEAFOOD'),
('Canned Salmon','Chicken Of The Sea® Wild Caught Alaskan Pink Salmon Pouch','SEAFOOD'),
('Canned Tuna','Yellowfin Tuna Fillets in Spring Water, 6.7 OZ','BEVERAGES'),
('Canned Tuna','Simple Truth® Pole and Line Skipjack Chunk Light Tuna in Spring Water with Sea Salt','BEVERAGES'),
('Canned Tuna','Sprouts No Salt Added Yellowfin Wild Tuna In Spring Water','BEVERAGES'),
('Canned Tuna','Sprouts Yellowfin Tuna In Spring Water With Sea Salt','BEVERAGES'),
('Canned Tuna','Tonnino Tuna Fillets in Spring Water','BEVERAGES'),
('Canned Tuna','Tonnino Tuna, in Spring Water, Solid Pack','BEVERAGES'),
('Canned Tuna','Sprouts Albacore Chunk White Wild Tuna in Spring Water With Sea Salt 4 Pack','BEVERAGES'),
('Canned Tuna','Tonnino Tuna Yellowfin Tuna Fillets in Spring Water','BEVERAGES'),
('Canned Tuna','Central Market Yellowfin Tuna Fillets in Spring Water','BEVERAGES'),
('Canned Tuna','Yellowfin Tuna in Truffle Infused Olive Oil, 6.3 OZ','DESSERT'),
('Canned Tuna','Fresh Thyme Market Chunk Light Tuna','SEAFOOD'),
('Canned Tuna','Bowl & Basket Solid White Albacore Tuna in Water','SEAFOOD'),
('Canned Tuna','Fresh Thyme Market Solid White Tuna','SEAFOOD'),
('Canned Tuna','Zenshi Private Selection Rainbow Roll - Salmon Tuna','SEAFOOD'),
('Canned Tuna','Spicy Albacore Tuna Avocado Roll, 7 OZ','SEAFOOD'),
('Canned Tuna','Genova Mediterranean Bean Salad Tuna Bowl','SEAFOOD'),
('Canned Tuna','AFC Tuna Hawaiian Roll','SEAFOOD'),
('Canned Tuna','Marukome Spicy Tuna Volcano Roll','SEAFOOD'),
('Canned Tuna','Genova Mediterranean Lentil & Grain Tuna Bowl','SEAFOOD'),
('Canned Tuna','Bumble Bee Salad Kit, Tuna, Special Value, 6 Pack','SEAFOOD'),
('Canned Tuna','Albacore Tuna Avocado Roll, 7 OZ','SEAFOOD');

do $assertions$
declare
  v_total integer;
  v_move integer;
  v_excluded integer;
begin
  select count(*),
         count(*) filter (
           where public.prox_is_misplaced_canned_fish(canonical_id, canonical, name, category)
         ),
         count(*) filter (
           where not public.prox_is_misplaced_canned_fish(canonical_id, canonical, name, category)
         )
  into v_total, v_move, v_excluded
  from dq01_guard_names;

  if v_total <> 75 or v_move <> 66 or v_excluded <> 9 then
    raise exception 'guard regression changed: total %, move %, excluded %; expected 75/66/9',
      v_total, v_move, v_excluded;
  end if;

  if exists (
    select 1
    from dq01_guard_names n
    where not public.prox_is_misplaced_canned_fish(n.canonical_id, n.canonical, n.name, n.category)
      and n.name not in (
        'Safe Catch Ahi Wild Yellowfin Tuna Steaks, 5 oz, 6-count',
        'Zenshi Private Selection Rainbow Roll - Salmon Tuna',
        'Spicy Albacore Tuna Avocado Roll, 7 OZ',
        'Genova Mediterranean Bean Salad Tuna Bowl',
        'AFC Tuna Hawaiian Roll',
        'Marukome Spicy Tuna Volcano Roll',
        'Genova Mediterranean Lentil & Grain Tuna Bowl',
        'Bumble Bee Salad Kit, Tuna, Special Value, 6 Pack',
        'Albacore Tuna Avocado Roll, 7 OZ'
      )
  ) then
    raise exception 'name guard excluded an unreviewed product in the 75-name fixture';
  end if;

  if (
    select count(*)
    from dq01_guard_names n
    where not public.prox_is_misplaced_canned_fish(n.canonical_id, n.canonical, n.name, n.category)
      and n.name in (
        'Safe Catch Ahi Wild Yellowfin Tuna Steaks, 5 oz, 6-count',
        'Zenshi Private Selection Rainbow Roll - Salmon Tuna',
        'Spicy Albacore Tuna Avocado Roll, 7 OZ',
        'Genova Mediterranean Bean Salad Tuna Bowl',
        'AFC Tuna Hawaiian Roll',
        'Marukome Spicy Tuna Volcano Roll',
        'Genova Mediterranean Lentil & Grain Tuna Bowl',
        'Bumble Bee Salad Kit, Tuna, Special Value, 6 Pack',
        'Albacore Tuna Avocado Roll, 7 OZ'
      )
  ) <> 9 then
    raise exception 'name guard did not exclude all nine reviewed conservative/identity cases';
  end if;

  raise notice 'DQ-01 product-name fixture: % checked, % eligible, % reviewed exclusions, 0 unexpected exclusions',
    v_total, v_move, v_excluded;
end
$assertions$;
