import type { EducationPanel, EducationSource, TransmissionScenario } from "./types/education";

export const EDUCATION_SOURCES = [
	{
		id: "lecture_26e",
		label: "Lecture 26E, COVID-19 Virus Content",
		url: "docs/lect26e-cotagion-edit.pdf",
		note:
			"Classroom lecture source for outbreak, R0, incubation, " +
			"fomites, and flattening the curve.",
	},
	{
		id: "cdc_andes",
		label: "CDC Andes virus guidance",
		url: "https://www.cdc.gov/hantavirus/about/andesvirus.html",
		note: "Current public health framing for Andes virus spread, symptoms, and monitoring.",
	},
] as const satisfies readonly EducationSource[];

export const TRANSMISSION_SCENARIOS = [
	{
		id: "shared_cabin",
		title: "Shared cabin time",
		assumption:
			"Scenario assumption: a symptomatic passenger spends a long time " +
			"close to a cabin mate.",
		explanation:
			"Andes virus person-to-person spread is rare, but CDC frames " +
			"close contact with a sick person as the main concern.",
		optional: false,
	},
	{
		id: "dining_table",
		title: "Dining table contact",
		assumption:
			"Scenario assumption: people sit together in a close indoor space for a full meal.",
		explanation:
			"The simulator can model risk from prolonged time in close or " +
			"enclosed spaces, not from brief hallway passing.",
		optional: false,
	},
	{
		id: "medical_check",
		title: "Helping a sick traveler",
		assumption:
			"Scenario assumption: crew or a helper has direct contact with a symptomatic person.",
		explanation:
			"Close contact may include body fluids, respiratory secretions, " +
			"shared utensils, or contaminated bedding.",
		optional: false,
	},
	{
		id: "optional_fomite",
		title: "Optional surface contact",
		assumption:
			"Scenario assumption: surface spread is an optional setting, not the default driver.",
		explanation:
			"The lecture explains fomites as objects people touch. For Andes " +
			"virus, rodent exposure and close symptomatic contact stay more important.",
		optional: true,
	},
] as const satisfies readonly TransmissionScenario[];

export const EDUCATION_PANELS = [
	{
		id: "outbreak",
		title: "Outbreak",
		tone: "classroom",
		summary: "An outbreak is a sudden rise in cases of a disease.",
		classroomText:
			"In this simulator, an outbreak means more passengers become sick " +
			"than expected. The first question is not panic; it is what changed, " +
			"who was exposed, and when symptoms began.",
		cruiseShipScenario:
			"A cruise ship has shared rooms, meals, and activity spaces, so " +
			"investigators compare cabins, schedules, and possible rodent " +
			"exposure before choosing one explanation.",
		sourceIds: ["lecture_26e", "cdc_andes"],
		relatedScenarioIds: ["shared_cabin", "dining_table"],
	},
	{
		id: "r0",
		title: "R0",
		tone: "scenario_assumption",
		summary: "R0 is the average number of new infections from one contagious person.",
		classroomText:
			"R0 is a model number, not a magic label for a virus. It changes " +
			"when behavior changes, when people isolate, and when a setting " +
			"gives the virus more or fewer chances to spread.",
		cruiseShipScenario:
			"The game may raise or lower a scenario R0 when passengers spend " +
			"long indoor time together, report symptoms quickly, or reduce " +
			"close contact.",
		sourceIds: ["lecture_26e"],
		relatedScenarioIds: ["shared_cabin", "dining_table", "medical_check"],
	},
	{
		id: "incubation",
		title: "Incubation Period",
		tone: "classroom",
		summary: "Incubation is the time between exposure and the first symptoms.",
		classroomText:
			"Knowing the incubation range helps investigators look backward " +
			"from symptom dates to possible exposures. CDC currently describes " +
			"Andes virus symptoms as appearing 4 to 42 days after exposure.",
		cruiseShipScenario:
			"A passenger who feels fine today might still be in the monitoring " +
			"window, so the simulator can keep exposed people under watch before " +
			"counting them as clear.",
		sourceIds: ["lecture_26e", "cdc_andes"],
		relatedScenarioIds: ["shared_cabin", "medical_check"],
	},
	{
		id: "close_contact",
		title: "Close Contact",
		tone: "caution",
		summary: "Andes virus does not spread easily from person to person.",
		classroomText:
			"CDC says Andes virus is the hantavirus known for possible " +
			"person-to-person spread, usually with close contact with a " +
			"symptomatic person. Rodent exposure can still be part of the story.",
		cruiseShipScenario:
			"The model should treat brief contact as low concern and focus on " +
			"direct help, shared cabins, enclosed time, body fluids, and possible " +
			"earlier rodent exposure.",
		sourceIds: ["cdc_andes"],
		relatedScenarioIds: ["shared_cabin", "dining_table", "medical_check"],
	},
	{
		id: "uncertainty",
		title: "Uncertainty",
		tone: "caution",
		summary: "Early outbreak clues can point to more than one explanation.",
		classroomText:
			"Scientists separate what is known from what is assumed. In a ship " +
			"outbreak, similar cases might come from shared rodent exposure, " +
			"close contact with a sick person, or both.",
		cruiseShipScenario:
			"The simulator labels mechanisms as scenario assumptions so students " +
			"can test ideas without treating the model as medical advice.",
		sourceIds: ["cdc_andes"],
		relatedScenarioIds: ["shared_cabin", "medical_check", "optional_fomite"],
	},
	{
		id: "flattening_curve",
		title: "Flattening the Curve",
		tone: "classroom",
		summary:
			"Flattening the curve means slowing spread so serious cases do not surge all at once.",
		classroomText:
			"The lecture frames flattening the curve as keeping serious cases " +
			"below the level a health system can handle. Slower spread gives " +
			"helpers more time.",
		cruiseShipScenario:
			"In the game, distancing, monitoring, isolation after symptoms, and " +
			"fewer close-contact events can spread cases over time instead of " +
			"creating one big spike.",
		sourceIds: ["lecture_26e", "cdc_andes"],
		relatedScenarioIds: ["shared_cabin", "dining_table", "medical_check"],
	},
] as const satisfies readonly EducationPanel[];

export const EDUCATION_DISCLAIMER =
	"This classroom simulator explains outbreak ideas. It is not medical advice.";
