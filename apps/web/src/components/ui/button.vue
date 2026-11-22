<script setup lang="ts">
import { cva, type VariantProps } from 'class-variance-authority'
import { computed, useAttrs } from 'vue'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'border border-border bg-card text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-2.5 text-xs',
        icon: 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

const props = withDefaults(defineProps<{
  variant?: VariantProps<typeof buttonVariants>['variant']
  size?: VariantProps<typeof buttonVariants>['size']
  type?: 'button' | 'submit' | 'reset'
}>(), {
  variant: 'default',
  size: 'default',
  type: 'button',
})

const attrs = useAttrs()
const classes = computed(() => cn(buttonVariants({ variant: props.variant, size: props.size }), attrs.class as string | undefined))
</script>

<template>
  <button :type="type" :class="classes" v-bind="{ ...attrs, class: undefined }">
    <slot />
  </button>
</template>
