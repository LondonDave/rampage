package main

import (
	"fmt"
	"strconv"
)

func main() {
	for n := 0; n < 10; n++ {
		cards := Shuffle(17)
		for i := 0; i < 12; i = i + 2 {
			for i := 12; i < 17; i++ {
				fmt.Print(cardName(cards[i]), "  ")
			}
			fmt.Print(cardName(cards[i]), "  ", cardName(cards[i+1]), "    ")
			handValue, mask := Evaluate(cards[i:i+2], cards[12:17])
			fmt.Println(strconv.FormatInt(int64(handValue), 16), mask)
		}
	}
}
