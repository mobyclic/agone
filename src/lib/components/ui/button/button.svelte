<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import { type VariantProps, tv } from "tailwind-variants";

	// Agone — coins arrondis, casse normale, primaire rouge de marque / texte blanc.
	export const buttonVariants = tv({
		base: "focus-visible:ring-ring/40 aria-invalid:ring-destructive/30 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-md border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-4 active:not-aria-[haspopup]:translate-y-px [&_svg:not([class*='size-'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			variant: {
				// Filled (par défaut) — aplat rouge de marque / texte blanc
				default: "bg-brand-red text-white hover:bg-brand-red-dark aria-expanded:bg-brand-red-dark",
				// Marque — rouge (CTA d'accent, alias explicite)
				brand: "bg-brand-red text-white hover:bg-brand-red-dark aria-expanded:bg-brand-red-dark",
				// Tonal — secondaire doux
				secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary/90",
				// Outlined
				outline: "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
				// Text (= ghost)
				ghost: "hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
				// Destructive
				destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
				// Link
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
				xs: "h-7 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
				sm: "h-8 gap-1.5 px-3 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
				lg: "h-12 gap-2 px-6 text-[15px]",
				icon: "size-10",
				"icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-8",
				"icon-lg": "size-12",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
