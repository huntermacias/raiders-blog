import {useMemo} from 'react'
import {Autocomplete, Box, Flex, Text} from '@sanity/ui'
import {set, unset, type StringInputProps} from 'sanity'

import players from '../data/lab/players.json'
import {searchIndex, type PlayersData} from '../lib/lab/playersKit'

/**
 * Lets an editor pick a player by typing his name, and stores the player's page slug (the part of
 * raidersrundown.com/lab/players/<slug> after the last slash). The list is the same data the site's player pages are built from, so a
 * name that can be picked here always has a page.
 */
export function PlayerSlugInput(props: StringInputProps) {
  const {value, onChange, readOnly} = props
  const options = useMemo(
    () => searchIndex(players as unknown as PlayersData).map((p) => ({value: p.slug, payload: p})),
    [],
  )
  const current = options.find((o) => o.value === value)
  return (
    <Autocomplete
      id="player-slug"
      readOnly={readOnly}
      openButton
      placeholder="Type a player's name"
      options={options}
      value={value ?? ''}
      filterOption={(query, option) => {
        const q = query.trim().toLowerCase()
        return q.length > 0 && option.payload.name.toLowerCase().includes(q)
      }}
      renderOption={(option) => (
        <Box padding={3}>
          <Flex justify="space-between" gap={3}>
            <Text size={1}>{option.payload.name}</Text>
            <Text size={1} muted>
              {option.payload.team} · {option.payload.pos}
            </Text>
          </Flex>
        </Box>
      )}
      renderValue={(v) => current?.payload.name ?? v}
      onChange={(next) => onChange(next ? set(next) : unset())}
    />
  )
}
