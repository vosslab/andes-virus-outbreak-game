export type EducationPanelId =
	| "outbreak"
	| "r0"
	| "incubation"
	| "close_contact"
	| "uncertainty"
	| "flattening_curve";

export type EducationSourceId = "lecture_26e" | "cdc_andes";

export type TransmissionScenarioId =
	| "shared_cabin"
	| "dining_table"
	| "medical_check"
	| "optional_fomite";

export type EducationTone = "classroom" | "scenario_assumption" | "caution";

export interface EducationSource {
	readonly id: EducationSourceId;
	readonly label: string;
	readonly url: string;
	readonly note: string;
}

export interface TransmissionScenario {
	readonly id: TransmissionScenarioId;
	readonly title: string;
	readonly assumption: string;
	readonly explanation: string;
	readonly optional: boolean;
}

export interface EducationPanel {
	readonly id: EducationPanelId;
	readonly title: string;
	readonly tone: EducationTone;
	readonly summary: string;
	readonly classroomText: string;
	readonly cruiseShipScenario: string;
	readonly sourceIds: readonly EducationSourceId[];
	readonly relatedScenarioIds: readonly TransmissionScenarioId[];
}
