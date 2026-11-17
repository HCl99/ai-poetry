/**
 * 学段题库：按教育部中小学必背篇目整理的经典名录（与诗库 title+author 对应）。
 * 唐诗/宋词库标题存在异体（如「辋川集 鹿柴」「越调·天净沙秋思」），这里统一用库内实际标题，
 * 以免抽题时匹配不到。
 */

export type Stage = 'primary' | 'junior' | 'senior' | 'college' | 'adult';

export const STAGE_ORDER: Stage[] = ['primary', 'junior', 'senior', 'college', 'adult'];

export const STAGE_LABEL: Record<Stage, string> = {
  primary: '小学',
  junior: '初中',
  senior: '高中',
  college: '大学',
  adult: '成人',
};

export const STAGE_DESC: Record<Stage, string> = {
  primary: '小学必背 · 五言七绝为主，篇幅短、意象浅',
  junior: '初中必背 · 律诗与经典词牌，重意境与典故',
  senior: '高中必背 · 长篇歌行与豪放婉约，重章法与用典',
  college: '大学 · 诗经楚辞到唐宋名篇，重文本细读与文学史脉络',
  adult: '成人 · 跳出教材，按兴趣读经典名篇，重赏析与心境共鸣',
};

/** 各学段默认答题难度（仍可在测验页手动调整） */
export const STAGE_DIFFICULTY: Record<Stage, 'easy' | 'medium' | 'hard'> = {
  primary: 'easy',
  junior: 'medium',
  senior: 'hard',
  college: 'hard',
  adult: 'hard',
};

/** 学习方向：决定默认题型与推荐倾向 */
export type Goal = 'exam' | 'taste' | 'create';

export const GOAL_ORDER: Goal[] = ['exam', 'taste', 'create'];

export const GOAL_LABEL: Record<Goal, string> = {
  exam: '应试巩固',
  taste: '兴趣赏析',
  create: '创作提升',
};

export const GOAL_DESC: Record<Goal, string> = {
  exam: '以默写、辨误、作者诗题为主，按考点强度出题',
  taste: '以鉴赏与情感共鸣为主，重意境与手法',
  create: '以格律、炼字、意象组合为主，兼顾仿写练习',
};

export interface ClassicPoem {
  title: string;
  author: string;
}

export const STAGE_POEMS: Record<Stage, ClassicPoem[]> = {
  primary: [
    { title: '静夜思', author: '李白' },
    { title: '春晓', author: '孟浩然' },
    { title: '咏鹅', author: '骆宾王' },
    { title: '登鹳雀楼', author: '王之涣' },
    { title: '古风二首 一', author: '李绅' },
    { title: '江雪', author: '柳宗元' },
    { title: '寻隐者不遇', author: '贾岛' },
    { title: '池上', author: '白居易' },
    { title: '小池', author: '杨万里' },
    { title: '望庐山瀑布', author: '李白' },
    { title: '赠汪伦', author: '李白' },
    { title: '早发白帝城', author: '李白' },
    { title: '绝句', author: '杜甫' },
    { title: '望天门山', author: '李白' },
    { title: '山行', author: '杜牧' },
    { title: '枫桥夜泊', author: '张继' },
    { title: '九月九日忆山东兄弟', author: '王维' },
    { title: '黄鹤楼送孟浩然之广陵', author: '李白' },
    { title: '独坐敬亭山', author: '李白' },
    { title: '辋川集 鹿柴', author: '王维' },
    { title: '相思', author: '王维' },
    { title: '风', author: '李峤' },
    { title: '古朗月行', author: '李白' },
    { title: '梅花', author: '王安石' },
    { title: '小儿垂钓', author: '胡令能' },
    { title: '清平乐', author: '辛弃疾' },
    { title: '四时田园杂兴', author: '范成大' },
    { title: '宿新市徐公店', author: '杨万里' },
    { title: '夜书所见', author: '叶绍翁' },
    { title: '题西林壁', author: '苏轼' },
    { title: '饮湖上初晴后雨', author: '苏轼' },
    { title: '元日', author: '王安石' },
    { title: '赋得古原草送别', author: '白居易' },
    { title: '忆江南', author: '白居易' },
  ],
  junior: [
    { title: '次北固山下', author: '王湾' },
    { title: '越调·天净沙秋思', author: '马致远' },
    { title: '闻王昌龄左迁龙标遥有此寄', author: '李白' },
    { title: '行路难', author: '李白' },
    { title: '望岳', author: '杜甫' },
    { title: '春望', author: '杜甫' },
    { title: '茅屋为秋风所破歌', author: '杜甫' },
    { title: '使至塞上', author: '王维' },
    { title: '雁门太守行', author: '李贺' },
    { title: '赤壁', author: '杜牧' },
    { title: '泊秦淮', author: '杜牧' },
    { title: '夜雨寄北', author: '李商隐' },
    { title: '无题', author: '李商隐' },
    { title: '相见欢', author: '李煜' },
    { title: '渔家傲', author: '范仲淹' },
    { title: '江神子·江城子', author: '苏轼' },
    { title: '水调歌头', author: '苏轼' },
    { title: '破阵子', author: '辛弃疾' },
    { title: '中吕·山坡羊', author: '张养浩' },
    { title: '登幽州台歌', author: '陈子昂' },
    { title: '杜少府之任蜀州', author: '王勃' },
    { title: '白雪歌送武判官归京', author: '岑参' },
    { title: '酬乐天扬州初逢席上见赠', author: '刘禹锡' },
    { title: '观沧海', author: '曹操' },
    { title: '龟虽寿', author: '曹操' },
  ],
  senior: [
    { title: '短歌行', author: '曹操' },
    { title: '蜀道难', author: '李白' },
    { title: '梦游天姥吟留别', author: '李白' },
    { title: '登高', author: '杜甫' },
    { title: '客至', author: '杜甫' },
    { title: '琵琶引', author: '白居易' },
    { title: '长恨歌', author: '白居易' },
    { title: '念奴娇', author: '苏轼' },
    { title: '永遇乐', author: '辛弃疾' },
    { title: '声声慢', author: '李清照' },
    { title: '雨霖铃', author: '柳永' },
    { title: '扬州慢', author: '姜夔' },
    { title: '书愤', author: '陆游' },
    { title: '锦瑟', author: '李商隐' },
    { title: '李凭箜篌引', author: '李贺' },
    { title: '春江花月夜', author: '张若虚' },
    { title: '山居秋暝', author: '王维' },
    { title: '燕歌行', author: '高适' },
  ],
  /** 大学：在高中名篇基础上加入诗骚、汉魏与宋词大家，重文学史脉络 */
  college: [
    { title: '短歌行', author: '曹操' },
    { title: '观沧海', author: '曹操' },
    { title: '蜀道难', author: '李白' },
    { title: '行路难', author: '李白' },
    { title: '梦游天姥吟留别', author: '李白' },
    { title: '登高', author: '杜甫' },
    { title: '望岳', author: '杜甫' },
    { title: '春望', author: '杜甫' },
    { title: '茅屋为秋风所破歌', author: '杜甫' },
    { title: '琵琶引', author: '白居易' },
    { title: '长恨歌', author: '白居易' },
    { title: '锦瑟', author: '李商隐' },
    { title: '无题', author: '李商隐' },
    { title: '李凭箜篌引', author: '李贺' },
    { title: '春江花月夜', author: '张若虚' },
    { title: '山居秋暝', author: '王维' },
    { title: '燕歌行', author: '高适' },
    { title: '白雪歌送武判官归京', author: '岑参' },
    { title: '念奴娇', author: '苏轼' },
    { title: '水调歌头', author: '苏轼' },
    { title: '永遇乐', author: '辛弃疾' },
    { title: '破阵子', author: '辛弃疾' },
    { title: '声声慢', author: '李清照' },
    { title: '雨霖铃', author: '柳永' },
    { title: '扬州慢', author: '姜夔' },
    { title: '书愤', author: '陆游' },
    { title: '越调·天净沙秋思', author: '马致远' },
  ],
  /** 成人：以传诵度高的名篇为主，兼顾豪放婉约与人生况味 */
  adult: [
    { title: '短歌行', author: '曹操' },
    { title: '观沧海', author: '曹操' },
    { title: '蜀道难', author: '李白' },
    { title: '行路难', author: '李白' },
    { title: '将进酒', author: '李白' },
    { title: '梦游天姥吟留别', author: '李白' },
    { title: '登高', author: '杜甫' },
    { title: '春望', author: '杜甫' },
    { title: '客至', author: '杜甫' },
    { title: '茅屋为秋风所破歌', author: '杜甫' },
    { title: '琵琶引', author: '白居易' },
    { title: '长恨歌', author: '白居易' },
    { title: '锦瑟', author: '李商隐' },
    { title: '春江花月夜', author: '张若虚' },
    { title: '山居秋暝', author: '王维' },
    { title: '使至塞上', author: '王维' },
    { title: '念奴娇', author: '苏轼' },
    { title: '水调歌头', author: '苏轼' },
    { title: '定风波', author: '苏轼' },
    { title: '永遇乐', author: '辛弃疾' },
    { title: '破阵子', author: '辛弃疾' },
    { title: '声声慢', author: '李清照' },
    { title: '雨霖铃', author: '柳永' },
    { title: '扬州慢', author: '姜夔' },
    { title: '书愤', author: '陆游' },
    { title: '越调·天净沙秋思', author: '马致远' },
  ],
};

export function isStage(v: unknown): v is Stage {
  return v === 'primary' || v === 'junior' || v === 'senior' || v === 'college' || v === 'adult';
}

export function isGoal(v: unknown): v is Goal {
  return v === 'exam' || v === 'taste' || v === 'create';
}

export function normalizeStage(v: unknown): Stage {
  return isStage(v) ? v : 'junior';
}
