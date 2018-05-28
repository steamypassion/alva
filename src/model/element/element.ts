import { ElementContent } from './element-content';
import { ElementProperty } from './element-property';
import * as Mobx from 'mobx';
import { Page } from '../page';
import { Pattern } from '../pattern';
import { PatternLibrary } from '../pattern-library';
import { Project } from '../project';
import * as Types from '../types';
import * as uuid from 'uuid';

export interface ElementInit {
	containerId?: string;
	contentIds: string[];
	dragged: boolean;
	highlighted: boolean;
	id?: string;
	name?: string;
	open: boolean;
	patternId: string;
	placeholderHighlighted: boolean;
	properties: ElementProperty[];
	selected: boolean;
	setDefaults?: boolean;
}

export interface ElementContext {
	patternLibrary: PatternLibrary;
	project: Project;
}

export class Element {
	@Mobx.observable private containerId?: string;

	private readonly contentIds: string[] = [];

	@Mobx.observable private dragged: boolean;

	@Mobx.observable private editedName: string;

	@Mobx.observable private highlighted: boolean;

	private readonly id: string;

	@Mobx.observable private name: string;

	@Mobx.observable private nameEditable: boolean = false;

	@Mobx.observable private open: boolean;

	@Mobx.observable private page?: Page;

	@Mobx.observable private parent: Element;

	private readonly patternId: string;

	private readonly patternLibrary: PatternLibrary;

	@Mobx.observable private placeholderHighlighted: boolean;

	private readonly project: Project;

	private readonly properties: ElementProperty[];

	@Mobx.observable private selected: boolean;

	public constructor(init: ElementInit, context: ElementContext) {
		this.dragged = init.dragged;
		this.highlighted = init.highlighted;
		this.id = init.id ? init.id : uuid.v4();
		this.patternId = init.patternId;
		this.containerId = init.containerId;
		this.open = init.open;
		this.patternLibrary = context.patternLibrary;
		this.project = context.project;
		this.selected = init.selected;

		const pattern = this.patternLibrary.getPatternById(this.patternId);

		this.contentIds = init.contentIds;

		if (typeof init.name !== 'undefined') {
			this.name = init.name;
		}

		if (this.name === undefined && pattern) {
			this.name = pattern.getName();
		}

		const getProperties = () => {
			if (!pattern) {
				return [];
			}
			return pattern.getProperties().map(patternProperty => {
				const hydratedProperty = init.properties.find(elementProperty =>
					elementProperty.hasPatternProperty(patternProperty)
				);

				if (hydratedProperty) {
					return hydratedProperty;
				}

				return new ElementProperty(
					{
						id: uuid.v4(),
						patternPropertyId: patternProperty.getId(),
						setDefault: Boolean(init.setDefaults),
						value: undefined
					},
					{
						patternLibrary: this.patternLibrary
					}
				);
			});
		};

		this.properties = getProperties();
	}

	public static from(serialized: Types.SerializedElement, context: ElementContext): Element {
		return new Element(
			{
				dragged: serialized.dragged,
				highlighted: serialized.highlighted,
				id: serialized.id,
				name: serialized.name,
				patternId: serialized.patternId,
				placeholderHighlighted: serialized.placeholderHighlighted,
				containerId: serialized.containerId,
				contentIds: serialized.contentIds,
				open: serialized.open,
				properties: serialized.properties.map(p =>
					ElementProperty.from(p, { patternLibrary: context.patternLibrary })
				),
				selected: serialized.selected
			},
			context
		);
	}

	public accepts(child: Element): boolean {
		return !child.isAncestorOfById(this.getId()) && child !== this && this.acceptsChildren();
	}

	public acceptsChildren(): boolean {
		return typeof this.getContentBySlotType(Types.SlotType.Children) !== 'undefined';
	}

	@Mobx.action
	public addChild(child: Element, slotId: string, index: number): void {
		child.setParent({
			parent: this,
			slotId,
			index
		});
	}

	@Mobx.action
	public clone(): Element {
		const clonedContents = this.contentIds
			.map(contentId => this.project.getElementContentById(contentId))
			.filter((content): content is ElementContent => typeof content !== 'undefined')
			.map(content => content.clone());

		const clone = new Element(
			{
				dragged: false,
				highlighted: false,
				id: uuid.v4(),
				containerId: undefined,
				contentIds: clonedContents.map(content => content.getId()),
				name: this.name,
				open: false,
				patternId: this.patternId,
				placeholderHighlighted: false,
				properties: this.properties.map(propertyValue => propertyValue.clone()),
				selected: false
			},
			{
				patternLibrary: this.patternLibrary,
				project: this.project
			}
		);

		clonedContents.forEach(clonedContent => {
			clonedContent.setParentElement(clone);
			this.project.addElementContent(clonedContent);
		});

		this.project.addElement(clone);
		return clone;
	}

	public getContainer(): ElementContent | undefined {
		if (!this.containerId) {
			return;
		}
		return this.project.getElementContentById(this.containerId);
	}

	public getContainerType(): undefined | Types.SlotType {
		const container = this.getContainer();

		if (!container) {
			return;
		}

		return container.getSlotType();
	}

	public getContentById(contentId: string): ElementContent | undefined {
		let result;

		for (const content of this.getContents()) {
			if (content.getId() === contentId) {
				result = content;
				break;
			}

			for (const element of content.getElements()) {
				result = element.getContentById(contentId);

				if (result) {
					break;
				}
			}

			if (result) {
				break;
			}
		}

		return result;
	}

	public getContentBySlotId(slotId: string): ElementContent | undefined {
		return this.getContents().find(content => content.getSlotId() === slotId);
	}

	public getContentBySlotType(slotType: Types.SlotType): ElementContent | undefined {
		return this.getContents().find(content => content.getSlotType() === slotType);
	}

	public getContents(): ElementContent[] {
		return this.contentIds
			.map(contentId => this.project.getElementContentById(contentId))
			.filter(
				(elementContent): elementContent is ElementContent =>
					typeof elementContent !== 'undefined'
			);
	}

	public getDescendants(): Element[] {
		return this.getContents().reduce((acc, content) => [...acc, ...content.getDescendants()], []);
	}

	public getDragged(): boolean {
		return this.dragged;
	}

	public getElementById(id: string): Element | undefined {
		let result;

		if (this.id === id) {
			return this;
		}

		for (const content of this.getContents()) {
			for (const element of content.getElements()) {
				result = element.getElementById(id);

				if (result) {
					break;
				}
			}

			if (result) {
				break;
			}
		}

		return result;
	}

	public getHighlighted(): boolean {
		return this.highlighted;
	}

	public getId(): string {
		return this.id;
	}

	public getIndex(): number {
		const container = this.getContainer();

		if (!container) {
			return -1;
		}

		return container.getElementIndexById(this.getId());
	}

	public getName(opts?: { unedited: boolean }): string {
		if ((!opts || !opts.unedited) && this.nameEditable) {
			return this.editedName;
		}

		return this.name;
	}

	public getOpen(): boolean {
		return this.open;
	}

	public getPage(): Page | undefined {
		if (this.page) {
			return this.page;
		}

		if (this.parent) {
			return this.parent.getPage();
		}

		return;
	}

	public getParent(): Element | undefined {
		const container = this.getContainer();

		if (!container) {
			return;
		}

		const containerParentId = container.getParentElementId();

		if (!containerParentId) {
			return;
		}

		return this.project.getElementById(containerParentId);
	}

	public getPattern(): Pattern | undefined {
		return this.patternLibrary.getPatternById(this.patternId);
	}

	public getPlaceholderHighlighted(): boolean {
		return this.placeholderHighlighted;
	}

	public getProperties(): ElementProperty[] {
		return this.properties;
	}

	public getSelected(): boolean {
		return this.selected;
	}

	public isAncestorOfById(id: string): boolean {
		const match = this.getElementById(id);
		return Boolean(match);
	}

	public isNameEditable(): boolean {
		return this.nameEditable;
	}

	public isRoot(): boolean {
		return !Boolean(this.getContainer());
	}

	@Mobx.action
	public remove(): void {
		const container = this.getContainer();

		if (container) {
			container.remove({ element: this });
		}
	}

	@Mobx.action
	public setContainer(container: ElementContent): void {
		this.containerId = container.getId();
	}

	@Mobx.action
	public setDragged(dragged: boolean): void {
		this.dragged = dragged;
	}

	@Mobx.action
	public setHighlighted(highlighted: boolean): void {
		this.highlighted = highlighted;
	}

	@Mobx.action
	public setIndex(index: number): void {
		const container = this.getContainer();

		if (!container) {
			return;
		}

		this.setParent({
			parent: this.parent,
			slotId: container.getSlotId(),
			index
		});
	}

	@Mobx.action
	public setName(name: string): void {
		if (this.nameEditable) {
			this.editedName = name;
		} else {
			this.name = name;
		}
	}

	@Mobx.action
	public setNameEditable(nameEditable: boolean): void {
		if (nameEditable) {
			this.editedName = this.name;
		} else {
			this.name = this.editedName || this.name;
		}

		this.nameEditable = nameEditable;
	}

	@Mobx.action
	public setOpen(open: boolean): void {
		this.open = open;
	}

	@Mobx.action
	public setPage(page: Page): void {
		this.page = page;
	}

	@Mobx.action
	public setParent(init: { index: number; parent: Element; slotId: string }): void {
		const previousContainer = this.getContainer();

		if (previousContainer) {
			previousContainer.remove({ element: this });
		}

		const container = init.parent.getContentBySlotId(init.slotId);

		if (container) {
			container.insert({ element: this, at: init.index });
			this.setContainer(container);
		}
	}

	@Mobx.action
	public setPlaceholderHighlighted(placeholderHighlighted: boolean): void {
		this.placeholderHighlighted = placeholderHighlighted;
	}

	@Mobx.action
	public setSelected(selected: boolean): void {
		this.selected = selected;
	}

	public toDisk(): Types.SerializedElement {
		const serialized = this.toJSON();
		// Do not save higlighted and selected states
		// to avoid excessive file changes e.g. for sharing
		serialized.dragged = false;
		serialized.highlighted = false;
		serialized.placeholderHighlighted = false;
		serialized.selected = false;
		return serialized;
	}

	@Mobx.action
	public toggleHighlighted(): void {
		this.setHighlighted(!this.getHighlighted());
	}

	@Mobx.action
	public toggleOpen(): void {
		this.setOpen(!this.getOpen());
	}

	@Mobx.action
	public toggleSelected(): void {
		this.setSelected(!this.getSelected());
	}

	public toJSON(): Types.SerializedElement {
		return {
			containerId: this.containerId,
			contentIds: Array.from(this.contentIds),
			dragged: this.dragged,
			highlighted: this.highlighted,
			id: this.id,
			name: this.name,
			open: this.open,
			patternId: this.patternId,
			placeholderHighlighted: this.placeholderHighlighted,
			properties: this.properties.map(elementProperty => elementProperty.toJSON()),
			selected: this.selected
		};
	}

	@Mobx.action
	public unsetContainer(): void {
		this.containerId = undefined;
	}
}