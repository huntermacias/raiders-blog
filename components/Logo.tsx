import Image from 'next/image';
import React from 'react'

function Logo(props: any) {
	const { renderDefault, title } = props;

  return (
	<div className='flex items-center space-x-2'>
		<Image 
			className="rounded-full object-cover"
			height={50}
			width={50}
			src="https://i.pinimg.com/originals/07/e6/4d/07e64d8088fd0ead3d3f15339008eb29.jpg"
			alt="logo"

		/>
		<>{renderDefault(props)}</>
	</div>
  )
}

export default Logo