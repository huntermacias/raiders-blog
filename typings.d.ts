type Base = {
	_createdAt: string; 
	_id: string; 
	_rev: string; 
	_type: string;
	_updatedAt: string;
};

interface Post extends Base {
	author: Author;
	body: Block[];
	categories: Category[];
	comments: Comment[];
	mainImage: Image;
	slug: Slug;
	title: string;
	description: string;
	
}

interface Author extends Base {
	bio: Block[];
	image: Image;
	name: string;
	slug: Slug;
}

interface Image {
	_type: 'image';
	asset: Reference;
}

interface Reference {
	_ref: string;
	_type: 'reference';
}

interface Slug {
	_type: 'slug';
	current: string;
}

interface Block {
	_key: string;
	_type: 'block';
	children: Span[];
	markDefs: any[];
	style: 'normal' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'blockquote';
}

interface Span {
	_key: string;
	_type: 'span';
	marks: string[];
	text: string;
}

interface Category extends Base {
	description: string; 
	title: string;
}

interface MainImage {
	_type: 'image';
	asset: Reference;
}

interface Title {
	_type: 'string';
	current: string;
}


interface Comment extends Base {
	approved: boolean;  
	title: string;
	comment: string; 
	email: string; 
	name: string;
	post: {
		_ref: string;
		_type: string;
	};
	// _createdAt: string; 
	// _id: string;
	// _rev: string;
	// _type: string;
	// _updatedAt: string;
}

interface TeamStatRow {
	_key: string;
	stat: string;
	raiders: string;
	opponent: string;
}

interface PlayerStatRow {
	_key: string;
	category: 'Passing' | 'Rushing' | 'Receiving' | 'Defense' | 'Special Teams';
	player: string;
	line: string;
	standout?: boolean;
}

interface QuarterScoreRow {
	_key: string;
	quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'OT';
	raiders?: number;
	opponent?: number;
}

interface KeyMoment {
	_key: string;
	quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'OT';
	time?: string;
	description: string;
}

interface VideoEmbedItem {
	_key: string;
	url: string;
	caption?: string;
}

interface PotmCandidate {
	_key: string;
	name: string;
	image?: Image;
	votes?: number;
}

interface Reactions {
	fire?: number;
	thumbsDown?: number;
	angry?: number;
}

interface GameReport extends Base {
	title: string;
	slug: Slug;
	description: string;
	opponent: string;
	gameDate: string;
	homeAway: 'home' | 'away';
	raidersScore: number;
	opponentScore: number;
	mainImage: Image;
	author: Author;
	categories: Category[];
	teamStats: TeamStatRow[];
	quarterScores?: QuarterScoreRow[];
	playerStats: PlayerStatRow[];
	videoEmbeds: VideoEmbedItem[];
	keyMoments?: KeyMoment[];
	body: Block[];
	pollQuestion?: string;
	pollOptionA?: string;
	pollOptionB?: string;
	pollVotesA?: number;
	pollVotesB?: number;
	potmCandidates?: PotmCandidate[];
	reactions?: Reactions;
	comments?: Comment[];
}

interface LiveUpdate {
	_key: string;
	body: string;
	embedUrl?: string;
	postedAt: string;
}

interface LiveEvent extends Base {
	title: string;
	slug: Slug;
	status: 'upcoming' | 'live' | 'final';
	relatedGame?: GameReport;
	startedAt?: string;
	updates?: LiveUpdate[];
}
