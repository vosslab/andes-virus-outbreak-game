export type RandomState = {
	readonly seed: number;
};

export type RandomStep = {
	readonly state: RandomState;
	readonly value: number;
};

const LCG_MODULUS = 2_147_483_647;
const LCG_MULTIPLIER = 48_271;

export function createRandomState(seed: number): RandomState {
	const normalizedSeed = normalizeSeed(seed);
	const state = { seed: normalizedSeed };
	return state;
}

export function nextRandom(state: RandomState): RandomStep {
	const nextSeed = (state.seed * LCG_MULTIPLIER) % LCG_MODULUS;
	const value = nextSeed / LCG_MODULUS;
	const step = {
		state: { seed: nextSeed },
		value,
	};
	return step;
}

export function chance(state: RandomState, probability: number): RandomStep & {
	readonly happened: boolean;
} {
	const boundedProbability = clampProbability(probability);
	const step = nextRandom(state);
	const result = {
		state: step.state,
		value: step.value,
		happened: step.value < boundedProbability,
	};
	return result;
}

export function randomInt(
	state: RandomState,
	minInclusive: number,
	maxInclusive: number,
): RandomStep & { readonly integer: number } {
	if (maxInclusive < minInclusive) {
		throw new Error("randomInt requires maxInclusive >= minInclusive");
	}

	const step = nextRandom(state);
	const span = maxInclusive - minInclusive + 1;
	const integer = minInclusive + Math.floor(step.value * span);
	const result = {
		state: step.state,
		value: step.value,
		integer,
	};
	return result;
}

export function clampProbability(probability: number): number {
	if (probability < 0) {
		return 0;
	}

	if (probability > 1) {
		return 1;
	}

	return probability;
}

function normalizeSeed(seed: number): number {
	const wholeSeed = Math.trunc(seed);
	const wrappedSeed = wholeSeed % LCG_MODULUS;

	if (wrappedSeed > 0) {
		return wrappedSeed;
	}

	const shiftedSeed = wrappedSeed + LCG_MODULUS - 1;
	return shiftedSeed;
}
