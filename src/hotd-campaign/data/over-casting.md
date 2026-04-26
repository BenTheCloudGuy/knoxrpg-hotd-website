# Overcasting: Pushing Beyond Your Limits

When a spellcaster has exhausted their spell slots or needs to cast a spell at a level beyond their available slots, they can draw on their own life force to fuel the magic. This is called overcasting. It is dangerous, painful, and not something any sane mage does lightly. The weave was not designed to be powered by mortal flesh and blood. But desperate times call for desperate measures, and the casters of Faerun have always found ways to push beyond what should be possible.

Overcasting works alongside the existing Circle Magic rules. Where Circle Magic lets multiple casters pool their slots to fuel a spell, overcasting lets a single caster burn their own body as fuel. The two systems can be combined: a Circle Lead who is out of slots can overcast to provide their share, paying the physical cost personally.


---

## The Body as Fuel 

This is the primary overcasting system. It uses Hit Dice and Constitution as the currency, with exhaustion as the escalating consequence if the caster keeps pushing themselves. This should help maintain balance, but give the casters the option to risk it all should they need too. 

### Core Mechanic

When you attempt to cast a spell and either (a) have no spell slots remaining, or (b) want to cast a spell at a higher level than your highest available slot, you can choose to overcast. You must still know the spell and meet all other casting requirements (components, concentration, etc.).

**Step 1: Pay the Hit Dice Cost.** Expend a number of Hit Dice equal to the difference between the target spell level and your highest available spell slot being consumed (or the full spell level if you have no slots remaining). Roll each expended Hit Die. The total rolled becomes necrotic damage you take as part of the casting (reduced on a successful save, see Step 2). This damage cannot be reduced or prevented by any means.

If you have a spell slot available, you may consume it to reduce the Hit Dice cost. The slot covers its level worth of the spell, and you pay the remainder in Hit Dice.

> *Example:* Casting Fireball at 6th level with a 3rd-level slot available: consume the 3rd-level slot + 3 HD (6 - 3 = 3). With only a 2nd-level slot: consume the 2nd-level slot + 4 HD (6 - 2 = 4). With no slots at all: 6 HD.

If you do not have enough Hit Dice remaining, you cannot overcast at that level. 

**Step 2: Constitution Saving Throw.** After expending the Hit Dice, make a Constitution saving throw. The DC scales with the spell level because higher level spells require you to draw more arcane power to manipulate the weave. Even if there is ZERO chance of you succeeding the save, you can still choose to overcast and just accept you will suffer the costs of doing so. You have free will after all! 

> We use Constituion vs Spell Casting Ability because you are drawing from your very life force to overcast, so CON saves feels like the most accurate way to impart that effect. 

**Overcasting DC = 10 + (2 x spell level)**

| Spell Level | DC |
|:-----------:|:--:|
| 1st | 12 |
| 2nd | 14 |
| 3rd | 16 |
| 4th | 18 |
| 5th | 20 |
| 6th | 22 |
| 7th | 24 |
| 8th | 26 |
| 9th | 28 |

**On a success:** The spell is cast normally. You take necrotic damage equal to **half the total rolled on the expended Hit Dice** (rounded down). The weave pulls from your body, but you maintained enough control to limit the cost.

**On a failure:** The spell is cast, but you gain **1 level of exhaustion** and take necrotic damage equal to **the full total rolled on the expended Hit Dice**. This damage cannot be reduced or prevented by any means. It represents the weave tearing through your body. No sane caster would do this unless the need was great.


### Exhaustion Rules

Overcasting relies on the 2014 PHB exhaustion rules. I'm just not a fan of the nerfed 2024 version of Exhaustion Rules.. 

Effects are cumulative:

| Level | Effect | MAX Con | HP Bonus |
|:-----:|:-------|:--------|:-----:|
| 1 | Disadvantage on ability checks | 12 | +1 |
| 2 | Speed halved | -2 | 0 |
| 3 | Disadvantage on attack rolls and saving throws | 8 | -1 | 
| 4 | Hit point maximum halved | 6 | -2 |
| 5 | Speed reduced to 0 | 4 | -3 |
| 6 | Death | CON 0 | --- |

Don't take the Max CON effect lightly.. Remember this is meant to be risky and punishing! 

> *Example:* An 8th-level Wizard with a base CON of 14 (+2) and 40 max HP reaches exhaustion 5 (effective CON 4, modifier -3). They lose the difference in CON bonus across all 8 levels: 8 x 5 = 40 HP lost from CON reduction alone, dropping their max to 1 (1 is minimum max HP for any player). But even at exhaustion 4 (CON 6, modifier -2), the math is pretty damn brutal: 40 - (8 x 4) = 8 HP from CON reduction, then halved by exhaustion 4 = 4 HP max. One more overcast and they hit exhaustion 5 (speed 0, cannot cast), or 6 (death).


### Overcasting While Exhausted

Each level of exhaustion you already have when you overcast increases the DC by 2. A caster at exhaustion level 2 attempting to overcast a 3rd-level spell faces DC 20 instead of DC 16.


**Effective DC = 10 + (2 x spell level) + (2 x current exhaustion level)** 

> This is the primary self-limiting factor and best way I could think of to make sure this didn't break the balance or mechanics of the system too much. We may have to play with this and tweak as needed. 

### Recovery

Hit Dice are recovered 1 HD per 4hrs of rest (that means not doing anything strenuous), and any HD Spent to overcast is unavailable to be used for healing during short/long rests.  Exhaustion from overcasting is removed normally (1 level per 24hrs of rest with food and water, or via Lesser/Greater Restoration spells).

> Per our house rules - a player may only use a single HD during a Short Rest (1hr), if they have any left. They may use upto 1/2 their available HD on a long rest (8hrs). And may use all their HD for 24hrs of continous rest. A player may recover 1 HP + CON Bonus per short rest if they don't burn any HD. 

There is no fast recovery for overcasting. This is intentional. It means overcasting in the first combat of the day has consequences that last for the entire adventuring day.

### Limits
- You cannot overcast a spell at a level higher than 9th (The Gods forbid it!)
- You cannot overcast if you have 0 Hit Dice remaining.
- You cannot overcast while at exhaustion level 5 (speed is 0, you can barely move, let alone channel the weave).

## Circle Integration

When a Circle member has no spell slots remaining but still wants to contribute to a Circle spell, they can overcast their contribution. They follow the standard overcasting rules for their portion of the cost:

- Expend Hit Dice equal to the slot level they would have contributed.
- Make a Constitution saving throw at the standard overcasting DC.
- Gain exhaustion on success or failure as normal.

The Lead can also overcast to fuel the base spell if they have no slots remaining, while circle members contribute slots for enhancements normally.

### Circle Protection

When overcasting as part of a Circle, the DC is reduced by 1 for each circle member who contributed a spell slot (not an overcast) to the same spell. The shared weave of the circle stabilizes the raw energy. This bonus cannot reduce the DC below the base spell level + 12.

> *Example:* A Wizard (no slots left) leads a circle of 3. Two members contribute 2nd-level slots. The Wizard overcasts a 3rd-level Fireball. Base DC is 16. Two circle members contributed slots, so the DC is reduced by 2 to 14.

This creates a tactical choice for the casters in the party. It is almost always better to use Circle Magic (pool your resources) than to overcast solo. Overcasting becomes the last resort when the circle can't cover the cost, or when you're alone. 

> As a side note, please remember the Golden Rule of D&D.. If you can do it, the BBG can do it.. :D 

