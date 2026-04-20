const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const client = new OpenAI();

const OUT_DIR = path.join(__dirname, '..', 'src', 'hotd-campaign', 'images');
const CONCURRENCY = 5;
const STYLE = 'Dark fantasy character portrait, digital painting style, head and shoulders framing, dramatic directional lighting, rich painterly brushwork, moody atmosphere, medieval fantasy setting, cinematic contrast, muted dark background, semi-realistic, D&D fantasy art.';

const MARTIKOV_FEATURES = 'Native American features, dark hair, dark alert eyes, short in stature, wearing eastern European fantasy-style clothing with raven feathers tied in hair';
const VISTANI_FEATURES = 'olive skin, dark hair, dark eyes, Romani-inspired styling';

const npcs = [
  // === CATEGORY 1: MISSING PORTRAITS ===
  {
    file: 'bildrath-cantemir.png',
    prompt: `${STYLE} A greedy human merchant in his 40s with a round fleshy face and small calculating greedy eyes. He has balding graying brown hair in a combover. He is heavyset and portly. He wears a stained leather apron over a merchant tunic, arms crossed defensively. His expression is suspicious and miserly. Behind him, cluttered shelves of overpriced goods in a dim cramped general store.`
  },
  {
    file: 'parriwimple.png',
    prompt: `${STYLE} A hulking young human man in his early 20s with a massive frame and broad shoulders. His face is round with slightly deformed features and a guileless childlike expression with soft trusting eyes. He has shaggy unkempt brown hair. He wears a simple laborer shirt with the sleeves rolled up revealing thick forearms. He holds a wooden crate effortlessly. Behind him, the dim interior of a cluttered village shop.`
  },
  {
    file: 'sarkov-etressa.png',
    prompt: `${STYLE} A broad-shouldered Vistani man in his late 40s with ${VISTANI_FEATURES} and intense watchful eyes. His jaw is set in grim silence. He has dark hair pulled back with thin waxed facial hair. He wears a simple innkeeper vest over a linen shirt, a towel draped over one shoulder. His expression is guarded and protective, the look of a man who says nothing but sees everything. Behind him, the warm amber glow of a tavern bar with hanging tankards.`
  },
  {
    file: 'luna-etressa.png',
    prompt: `${STYLE} A striking Vistani woman in her early 40s with warm ${VISTANI_FEATURES} and kind but weary eyes lined with exhaustion. Her dark hair falls in loose waves past her shoulders threaded with a few early grey strands. She wears a practical innkeeper dress with a colorful Vistani shawl draped over her shoulders. Her expression is warm but tired, a woman carrying the weight of exile and loss. Behind her, the warm interior of a village inn with firelight.`
  },
  {
    file: 'magda-etressa.png',
    prompt: `${STYLE} A stout Vistani woman in her late 60s with a hooked nose, deep-set shrewd eyes, and iron-grey hair tied in a messy bun. She grips a wooden cane in one hand like a weapon. She wears a flour-dusted apron over dark Vistani clothing. Her expression is a suspicious scowl, daring someone to cause trouble in her kitchen. Behind her, pots of bubbling stew and bundles of dried herbs hanging from rafters.`
  },
  {
    file: 'ilyana-kostova.png',
    prompt: `${STYLE} A tall wiry Vistani woman in her early 70s with a thin angular face and unnervingly perceptive dark eyes. She is draped in layered bright scarves over dark clothing. Her silver-grey hair hangs in long braids adorned with small charms. Her bony fingers are heavy with tarnished rings. Her expression is knowing and unsettling, as though she sees something behind the viewer. Behind her, a dim corner of a tavern with candlelight catching on her jewelry.`
  },
  {
    file: 'klara-vorovich.png',
    prompt: `${STYLE} A thin severe Vistani woman in her late 60s with long grey hair pulled back in a tight bun. Her face is angular and composed, with sharp watchful eyes that miss nothing. She wears a plain dark dress with a high collar and holds a leather-bound ledger against her chest. Her expression is a carefully neutral mask with a forced half-smile. Behind her, the quiet corner of an inn, shadows gathering around her.`
  },
  {
    file: 'bella-wormwiggle.png',
    prompt: `${STYLE} A kindly looking grandmother figure with a warm gap-toothed smile, stringy greasy dark hair under a headscarf. She wears a shawl over a patched dress. She stands beside a cart of freshly baked goods with pies steaming in the cool air. Her eyes watch with subtle predatory intensity beneath the grandmotherly facade. Behind her, a windmill on a hillside.`
  },
  {
    file: 'offalia-wormwiggle.png',
    prompt: `${STYLE} A shy seemingly innocent girl of about 10-12 years old with an innocent look but a subtle meanness in her eyes. She has tangled dark hair and wears a patchwork dress. She offers a meat pie in her outstretched hands with a sweet smile. Behind her, the shadow of a windmill.`
  },
  {
    file: 'yuri-skander.png',
    prompt: `${STYLE} A thin lanky human wizard in his late 60s with white hair and sharp intelligent eyes. He is clean-shaven, the only one of his kind without a beard. He wears wealthy merchant clothing with fine fabrics and arcane symbols embroidered subtly on his collar. A pair of spectacles rest on his nose and magical trinkets hang from his belt. His expression is shrewd and confident, a man of commerce and craft. Behind him, shelves lined with glowing potions, enchanted items, and arcane curiosities in a magic shop.`
  },
  {
    file: 'iskander.png',
    prompt: `${STYLE} A thin lanky human wizard in his late 60s with white hair, a long flowing white beard, and sharp intelligent eyes. He wears classic fantasy wizard robes in deep blue with a tall pointy hat. He holds a gnarled staff. His expression is thoughtful and watchful. Behind him, shelves of magical merchandise and glowing artifacts in a magic shop.`
  },
  {
    file: 'askander.png',
    prompt: `${STYLE} A thin lanky human wizard-alchemist in his late 60s with white hair, a long flowing white beard, and sharp intelligent eyes. He wears classic fantasy wizard robes in earthy green with a pointy hat. His fingers are stained from alchemical work and leather goggles are pushed up on his forehead. He holds a bubbling flask. Behind him, shelves of potions and alchemical apparatus in an alchemy shop.`
  },
  {
    file: 'uskander.png',
    prompt: `${STYLE} A thin lanky human wizard-antiquarian in his late 60s with white hair, a long flowing white beard, and sharp intelligent eyes. He wears classic fantasy wizard robes in dark brown with a pointy hat. He holds a magnifying lens and examines an ancient artifact. Behind him, shelves of dusty tomes, aged relics, and curiosities in an antique store.`
  },
  {
    file: 'eskander.png',
    prompt: `${STYLE} A thin lanky human wizard in his late 60s with white hair, a long flowing white beard, and sharp intelligent eyes. He wears classic fantasy wizard robes in dark red with a pointy hat. He holds an arcane wand. His expression is stern and focused. Behind him, shelves of magical merchandise and enchanted items in a magic shop.`
  },
  {
    file: 'oskander.png',
    prompt: `${STYLE} A thin lanky human wizard in his late 60s with white hair, a long flowing white beard, and gentle intelligent eyes. He wears classic fantasy wizard robes in soft grey with a pointy hat. His expression is gentler and more tender than a typical wizard, a man who chose love over magic. A rose is tucked into his belt. Behind him, a candlelit study with a vase of flowers on the desk.`
  },
  {
    file: 'nikolai-wachter-jr.png',
    prompt: `${STYLE} A young human nobleman around 19 years old with a handsome rakish face and a confident smirk. He has dark brown hair and grey eyes. He is athletic and healthy from years practicing with swords. He wears a fine but slightly disheveled nobleman doublet with the collar loosened. A sword hangs at his hip. His expression is charming and self-assured. Behind him, the warm glow of a tavern with wine goblets on a table.`
  },
  {
    file: 'karl-wachter.png',
    prompt: `${STYLE} A young human nobleman in his early teens with a thin studious face and thoughtful grey eyes. He has almost black hair. He wears a scholar jacket over a high-collared shirt. He holds a leather-bound book in one hand. His expression is haunted and serious, weighed down by grief beyond his years. Behind him, tall bookshelves in a candlelit library.`
  },
  {
    file: 'urwin-martikov.png',
    prompt: `${STYLE} A human man in his early 40s with ${MARTIKOV_FEATURES}. He has a short but strong build with a barrel chest. He wears an innkeeper apron over practical clothing. His expression is watchful and guarded, the look of a man with secrets. A faint silhouette of a raven perches on a rafter in the shadowed background behind him.`
  },
  {
    file: 'danika-martikov.png',
    prompt: `${STYLE} A capable human woman of about 38 with ${MARTIKOV_FEATURES}. She is short in stature. She wears a simple innkeeper dress with sleeves rolled up, drying a tankard with a cloth. A dark raven feather is tucked behind one ear. Her expression is warm but alert, the look of a mother who misses nothing. Behind her, the busy common room of a well-kept inn.`
  },
  {
    file: 'adrian-martikov.png',
    prompt: `${STYLE} A rugged human man in his late 40s with ${MARTIKOV_FEATURES}. He has a weathered outdoor complexion. He wears practical vineyard worker clothing with a leather vest. His hands are stained from grape harvest. His expression is steady and watchful. A raven silhouette is visible against the cloudy sky behind him, with rolling vineyard hills in the mist.`
  },
  {
    file: 'stefania-martikov.png',
    prompt: `${STYLE} A sturdy human woman in her mid 30s with ${MARTIKOV_FEATURES}. She is short in stature with a strong maternal presence. She wears practical winery worker clothing with a thick shawl. Her expression is steady and protective, a mother of four. Behind her, the stone walls of a winery with barrels stacked in the shadows.`
  },
  {
    file: 'elvir-martikov.png',
    prompt: `${STYLE} A young human woman in her early teens with ${MARTIKOV_FEATURES}. She has delicate sharp features and bright alert dark eyes. She is short. She wears a simple but well-made dress. A small raven pendant hangs at her throat. Her expression is curious and slightly guarded, with a hint of quiet strength. Behind her, the warm firelit interior of a tavern.`
  },
  {
    file: 'bray-martikov.png',
    prompt: `${STYLE} A teenage human boy of about 17 with ${MARTIKOV_FEATURES}. He has a thin eager face and sharp dark eyes. He is short. He wears a simple tunic with rolled-up sleeves. His expression is earnest and brave, a boy who wants to prove himself. Behind him, the shadowed eaves of a tavern where a raven watches from the roofline.`
  },
  {
    file: 'kiara-toranescu.png',
    prompt: `${STYLE} An older human woman in her 60s with silver-streaked wild hair and piercing amber-gold eyes. Her face is weathered and lined but still strong, with high cheekbones and a calm measured expression. She looks fully human. She wears layered furs and leather over a druid rough-spun dress, with bone and feather charms woven into her hair. Her hands are scarred from decades of healing work. Behind her, the flickering firelight of a cave den with wolf pelts on the walls.`
  },
  {
    file: 'duesius-toranescu.png',
    prompt: `${STYLE} A grizzled older human man in his 60s with a powerful build going slightly to age but still formidable. He has grey-streaked wild hair and a thick beard, with sharp amber-gold eyes full of quiet authority. A deep scar crosses one cheek. He wears heavy furs and battered leather armor. His expression is steady and watchful, a patriarch who has buried too many of his own. Behind him, the dark mouth of a cave den with firelight casting long shadows.`
  },
  {
    file: 'jiro-toranescu.png',
    prompt: `${STYLE} A young boy of about 8 years old with wild unkempt dark hair and fierce amber-gold eyes red-rimmed from crying. His face is dirty and streaked with dried tears but his jaw is set in defiant rage. He wears ragged furs too big for his small frame. He grips a battered kitchen knife in one white-knuckled fist. His expression is pure fury and heartbreak, a child who has lost everything. Behind him, the dark interior of a cave den.`
  },
  {
    file: 'ekrol-toranescu.png',
    prompt: `${STYLE} A young human warrior in his early 20s with a wiry but strong build and sharp amber-gold eyes. He has wild dark hair. He wears light leather armor with wolf-tooth adornments. His expression is proud and fierce, a promising young warrior. Behind him, a dark forest clearing with moonlight filtering through bare branches.`
  },
  {
    file: 'anna-krezkova.png',
    prompt: `${STYLE} A composed human woman in her 50s with sharp observant eyes and an air of quiet authority. She has red hair that is greying. She is slightly heavy with a full figure. She wears a noblewoman winter dress with a high fur collar, practical but elegant. A faint arcane glow emanates from a ring on her hand. Her expression is composed and watchful, grief visible in the lines around her eyes but held firmly in check by iron will. Behind her, the stone walls of a mountain village keep with snow-capped peaks visible through a narrow window.`
  },

  // === CATEGORY 2: BOOK ART REPLACEMENTS ===
  {
    file: 'strahd-von-zarovich.png',
    prompt: `${STYLE} An ancient vampire lord sitting in a dark gothic throne room. He has aristocratic angular features, pale bloodless skin, slicked-back dark hair with a pronounced widow peak, and piercing predatory crimson eyes. His face shows centuries of cruelty with a slight hint of madness. He wears elegant noble finery with a high-collared black and crimson cloak. One pale clawed hand rests on the arm of an ornate stone throne. His expression is cold, calculating amusement. The throne room behind him is dark and grand with tall gothic windows and candlelight.`
  },
  {
    file: 'ireena-kolyana.png',
    prompt: `${STYLE} A beautiful young human woman in her mid-20s with auburn red hair and determined compassionate green eyes. She wears practical traveling clothes with a sword at her hip and a high scarf covering her neck, hiding bite marks. Her expression is brave and resolute, a woman who refuses to be anyone victim. Behind her, the misty outskirts of a gloomy Barovian village.`
  },
  {
    file: 'ismark-kolyanovich.png',
    prompt: `${STYLE} A capable human warrior in his mid-30s with grey hair like his father, a strong jaw, and earnest determined eyes. He has a thin and healthy build. He wears practical chainmail over a militia leader surcoat. A longsword hangs at his side. His expression is resolute and burdened, a man who has finally stepped out of a legend shadow. Behind him, a village garrison with militia banners in the grey light.`
  },
  {
    file: 'rictavio-van-richten.png',
    prompt: `${STYLE} An older human man in his 60s, a legendary monster hunter. He has dark hair with distinguished grey temples and a neatly trimmed grey goatee, reminiscent of Dr. Strange. He wears a monster hunter practical leather coat with hidden pockets and stakes. He holds a famous repeating crossbow. His expression is grim and focused, the look of a man who has spent a lifetime hunting darkness. Behind him, a colorful Vistani-styled wagon and scattered monster-hunting tools.`
  },
  {
    file: 'ezmerelda-davenir.png',
    prompt: `${STYLE} A Vistani woman in her early 30s with ${VISTANI_FEATURES} and an air of fearless competence. She has dark curly hair. She wears a mix of Vistani traveling clothes and monster hunter leather armor with silver-tipped bolts in a bandolier across her chest. A hand crossbow is holstered at her hip. Her expression is daring and confident, a seasoned hunter. Behind her, a moonlit road with a horse-drawn wagon in the distance.`
  },
  {
    file: 'rahadin.png',
    prompt: `${STYLE} A dusk elf with dark brown African American skin tone, a bald head, sharp angular features, and cold merciless dark eyes. His ears are pointed. He has visible vampire fangs. He wears fine noble clothes befitting a chamberlain of a powerful lord. His expression is one of absolute emotionless devotion and quiet menace. Behind him, the dark stone corridors of a gothic castle.`
  },
  {
    file: 'baba-lysaga.png',
    prompt: `${STYLE} An impossibly ancient crone with deeply wrinkled bark-like skin and wild white hair matted with twigs and moss. Her eyes glow with unnatural green light. She is hunched and skeletal, wearing tattered robes of rotting cloth and animal hide. Gnarled fingers clutch a staff of twisted black wood. Insects crawl across her shoulders and arms. Her expression is mad devotion and ancient fury. Behind her, the dark silhouette of a hut perched on a massive tree stump in a flooded ruined village.`
  },
  {
    file: 'baron-vallakovich.png',
    prompt: `${STYLE} A large human nobleman in his early 60s with a broad earnest face and eyes that hold both determination and worry. He has long graying hair. He is a larger man but not obese. He wears a fine but practical burgomaster coat with a fur-trimmed collar and a chain of office. His expression is firm and resolute but strained, a man trying to hold his town together. Behind him, the warm interior of a manor hall with festival banners and candelabras.`
  },
  {
    file: 'fiona-wachter.png',
    prompt: `${STYLE} A human noblewoman in her 40s with sharp intelligent grey eyes, thin build, sharp facial features, and Asian features. She has dark hair. She wears an elegant dark gown with no obvious occult elements. Her expression is serious and stern, a woman of quiet composed authority. Behind her, the candlelit interior of a noble library with ancient tomes.`
  },
  {
    file: 'izek-strazni.png',
    prompt: `${STYLE} A hulking human man in his late 20s with auburn red hair like his sister, a brutal scarred face, and cold obsessive eyes. His right arm is monstrous and oversized, covered in dark barbs with subtle faint embers of fire glowing along it. He wears the heavy armor of a captain of the guard with a town militia tabard. His expression is menacing and intense. Behind him, the stone walls of a guard barracks.`
  },
  {
    file: 'gadof-blinsky.png',
    prompt: `${STYLE} An eccentric human man in his 40s with a short round face, large gut, wild bushy eyebrows, and a broad gap-toothed grin that is somehow both cheerful and unsettling. He wears a leather craftsman apron covered in paint stains and sawdust. He holds a headless doll in one hand and a tiny coffin-shaped music box in the other. A small monkey perches on his shoulder. His expression is manically cheerful. Behind him, shelves crammed with creepy toys, jack-in-the-boxes, and eerie puppet faces.`
  },
  {
    file: 'father-donavich.png',
    prompt: `${STYLE} A human priest in his late 50s with a gaunt but resolute face, somewhere between broken and renewed. He has brown short hair with greys at the edges. Normal build. He wears simple clerical robes with a sunburst holy symbol at his chest. His hands are clasped around a prayer book. His expression is weary but determined, a man clawing his faith back from darkness. Behind him, a modest stone church with candlelight and a stained-glass window.`
  },
  {
    file: 'doru.png',
    prompt: `${STYLE} A young human man in his early 30s with brown hair, a gaunt hardened face, and haunted eyes. His build is emaciated but starting to recover. He wears militia armor with a simple tabard. A longsword is strapped to his back. Visible vampire bite scars mark his neck. His expression is grim and fierce, the look of a man who knows what darkness can do. Behind him, ranks of militia soldiers in a village square at dawn.`
  },
  {
    file: 'morgantha.png',
    prompt: `${STYLE} A night hag disguised as a stooped kindly old woman with a deceptively sweet gap-toothed smile. She has grey wispy hair beneath a tattered headscarf and wears a dirty shawl over a patched dress. She stands beside a wooden pie cart loaded with golden pastries. But her eyes are sharp and predatory beneath the grandmotherly facade. Behind her, the Old Bonegrinder windmill looming against a stormy sky.`
  },
  {
    file: 'vladimir-horngaard.png',
    prompt: `${STYLE} A massive revenant in corroded plate armor bearing the faded crest of a silver dragon. His face is skeletal and decayed, with burning orange-red eyes full of undying hatred. His armor is blackened and pitted with age, a tattered cloak hanging from his shoulders. He grips a greatsword wreathed in necrotic energy. His expression is pure burning rage frozen in death. Behind him, the crumbling hall of a ruined mansion with shattered stained glass.`
  },
  {
    file: 'sir-godfrey-gwilym.png',
    prompt: `${STYLE} A revenant knight in tarnished but once-noble silver plate armor bearing the crest of a silver dragon. His face is spectral and translucent, with gentle blue-white eyes that hold sorrow and nobility. His armor while aged is maintained with care. He holds a longsword point-down in a gesture of peace. His expression is mournful but resolute, a spirit who refuses to abandon his oath. Behind him, a ruined chapel with moonlight streaming through a broken ceiling.`
  },
  {
    file: 'davian-martikov.png',
    prompt: `${STYLE} A gruff older human man in his 60s with ${MARTIKOV_FEATURES}. He has grey-streaked dark hair and a weathered deeply lined face. He is short in stature but tough. He wears a winemaker leather apron over sturdy work clothes with raven feathers woven into a band around his hat. His gnarled hands are stained dark from decades of crushing grapes. His expression is stern and no-nonsense. A raven perches on a barrel behind him. Behind him, the stone cellars of a winery with oak barrels.`
  },
  {
    file: 'pidlwick-ii.png',
    prompt: `${STYLE} A small clockwork construct resembling a court jester, about three feet tall. It has a painted porcelain face with a permanent eerie smile and glassy too-wide eyes. It wears a faded motley jester outfit in tattered red and gold with tiny bells that no longer ring. Its jointed wooden hands are posed in a mime gesture. The paint on its face is cracked and peeling. Its expression is frozen cheer that is deeply unsettling. Behind it, the dark stone corridors of a gothic castle with a staircase and a dangerously high ledge.`
  },
  {
    file: 'kiril-stoyanovich.png',
    prompt: `${STYLE} A massive brutal werewolf mid-transformation, more bestial than human. His face is elongating into a wolf snout with burning amber eyes full of hatred. Wild matted dark hair covers his head and spreads into fur across his hulking shoulders. Deep scars cross his face and bare arms. He wears bloodstained furs and crude leather armor with wolf-tooth trophies. His lips are pulled back in a snarl revealing massive fangs. Behind him, dark pine forest at night with wolf silhouettes.`
  },
  {
    file: 'zuleika-toranescu.png',
    prompt: `${STYLE} A powerful human man in his late 30s with a strong tall commanding build and sharp amber-gold eyes. He has wild dark hair. He wears a den leader mantle of thick wolf furs over leather armor. His expression is noble and measured, a just leader who chose peace over vengeance. Behind him, moonlit forest with the distant glow of a den campfire.`
  },
  {
    file: 'baron-krezkov.png',
    prompt: `${STYLE} A stern human man in his 60s with a weathered mountain-hardened face and cautious watchful eyes. He is balding on top. He is tall and strong for a man his age. He wears a practical nobleman fur-lined coat with a sword at his hip, dressed for governance and defense equally. His expression is guarded and sorrowful, a father mourning a lost child while holding his village together. Behind him, stone walls of a walled mountain village with snow-covered peaks and the silhouette of an abbey on the hill above.`
  },
  {
    file: 'luvash.png',
    prompt: `${STYLE} A large barrel-chested Vistani man in his 40s with a broad expressive face and dark passionate eyes. He has thick dark hair and ${VISTANI_FEATURES}. He wears a colorful Vistani vest over a loose shirt with a curved blade at his belt. His hands are large and expressive. His expression is that of a warm protective father and a fierce leader, a man who wears every feeling on his face. Behind him, colorful tents and campfires of a Vistani camp at twilight.`
  },
  {
    file: 'arrigal.png',
    prompt: `${STYLE} A lean handsome Vistani man in his late 30s with sharp calculating dark eyes and a neutral serious expression. He has dark hair and a neatly trimmed goatee, ${VISTANI_FEATURES}. He resembles his brother Luvash but is leaner and quieter. He wears a dark leather vest over a Vistani shirt with a hidden blade at his belt. His posture is relaxed and confident but his eyes are always watching. Behind him, the edge of a Vistani camp fading into shadow.`
  },
  {
    file: 'mad-mary.png',
    prompt: `${STYLE} A human woman in her late 30s who was once beautiful but is now ravaged by grief and madness. She has wild uncombed blonde hair and red-rimmed hollow eyes. Her face is gaunt and tear-streaked. She wears a faded once-fine dress now wrinkled and stained. Her hands clutch a small child doll to her chest. Her expression is utter devastation and deep madness, mouth open in a silent wail. Behind her, a dark boarded-up room with shuttered windows and a single guttering candle.`
  },
  {
    file: 'gertruda.png',
    prompt: `${STYLE} A young human woman of 17 with a soft innocent face and wide naive eyes full of childlike wonder. She has blonde hair like her mother. She wears a simple but clean village dress. Her expression is gentle and trusting, heartbreakingly innocent and unaware of danger. Behind her, the dark spires of Castle Ravenloft visible in the distance against a grey sky.`
  },
  {
    file: 'henrik-van-der-voort.png',
    prompt: `${STYLE} A thin nervous human man in his late 30s with sunken bloodshot eyes and hands that will not stop trembling. His face is gaunt and pale from sleepless nights with dark circles so deep they look like bruises. He wears a sawdust-covered carpenter apron. His expression is pure terrified exhaustion, eyes darting upward toward a ceiling he knows holds horrors. Behind him, half-finished coffins and woodworking tools in a cramped workshop with an ominous trapdoor to the loft above.`
  },
  {
    file: 'milivoj.png',
    prompt: `${STYLE} A scrawny young human man of 18 with a dirty gaunt hollow-cheeked face, hungry desperate eyes. He wears patched mud-stained laborer clothes. His hands are calloused and caked with grave dirt. His expression is exhausted anxious and hungry, a young man carrying a burden no teenager should bear. Behind him, a churchyard cemetery with tilted headstones and freshly turned earth in the grey light.`
  },
  {
    file: 'father-alric.png',
    prompt: `${STYLE} A gaunt old human man who looks more spirit than flesh, with silver hair and a deeply lined face marked by decades of sorrow and prayer. He wears a simple threadbare robe bearing the faded emblem of a sunburst, and a battered iron rosary with beads worn smooth hangs from his thin fingers. Despite his frail frame there is a quiet unbroken light in his eyes. His expression is gentle weary and resolute. Behind him, the interior of a small stone church with a single beam of pale light falling through a cracked window.`
  },
  {
    file: 'velinka-davenir.png',
    prompt: `${STYLE} A Vistani woman in her late 30s with ${VISTANI_FEATURES} and haunted dark eyes showing close resemblance to her niece Ezmerelda. She has dark curly hair. She wears druidic garb with woven vines and forest charms, but with a traditional colorful Vistani scarf on her head. Faint scars from burns cross her arms and neck. Her expression is distant and prophetic, as though she sees something burning beyond the horizon. Behind her, a misty forest clearing with ancient standing stones and a faint red glow of a distant unblinking eye in the sky.`
  }
];

// --- Concurrency-limited runner ---
let completed = 0;
let failed = 0;
const total = npcs.length;
const startTime = Date.now();

async function generateOne(npc) {
  const outPath = path.join(OUT_DIR, npc.file);
  if (fs.existsSync(outPath) && !npc.file.match(/^(strahd|ireena|ismark|rictavio|ezmerelda|rahadin|baba-lysaga|baron-vallakovich|fiona-wachter|izek-strazni|gadof-blinsky|father-donavich|doru|morgantha|vladimir-horngaard|sir-godfrey|davian-martikov|pidlwick|kiril-stoyanovich|zuleika-toranescu|baron-krezkov|luvash|arrigal|mad-mary|gertruda|henrik|milivoj|father-alric|velinka)/)) {
    // Skip if file exists and is NOT a book art replacement
    console.log(`[SKIP] ${npc.file} already exists`);
    completed++;
    return;
  }
  try {
    console.log(`[START] ${npc.file} (${completed + failed + 1}/${total})`);
    const result = await client.images.generate({
      model: 'gpt-image-1',
      prompt: npc.prompt,
      size: '1024x1024',
      quality: 'high',
      n: 1
    });
    const buffer = Buffer.from(result.data[0].b64_json, 'base64');
    fs.writeFileSync(outPath, buffer);
    completed++;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`[DONE] ${npc.file} (${buffer.length} bytes) [${completed}/${total} done, ${elapsed}s elapsed]`);
  } catch (err) {
    failed++;
    console.error(`[FAIL] ${npc.file}: ${err.message}`);
    // Write failure to a log
    fs.appendFileSync(path.join(__dirname, 'gen-failures.log'), `${npc.file}: ${err.message}\n`);
  }
}

async function runPool(tasks, concurrency) {
  const queue = [...tasks];
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const task = queue.shift();
        await generateOne(task);
      }
    })());
  }
  await Promise.all(workers);
}

console.log(`=== Generating ${total} NPC portraits with concurrency=${CONCURRENCY} ===`);
console.log(`Output: ${OUT_DIR}`);
runPool(npcs, CONCURRENCY).then(() => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n=== COMPLETE: ${completed} succeeded, ${failed} failed, ${elapsed}s total ===`);
  if (failed > 0) console.log('Check gen-failures.log for details');
});
