package main

import (
	"fmt"
	"strconv"

	"github.com/londondave/rampage/pkg/hand"
)

func main() {
	for n := 0; n < 1; n++ {
		cards := hand.Shuffle(17)
		for i := 0; i < 12; i = i + 2 {
			for i := 12; i < 17; i++ {
				fmt.Print(hand.CardName(cards[i]), "  ")
			}
			fmt.Print(hand.CardName(cards[i]), "  ", hand.CardName(cards[i+1]), "    ")
			handValue, mask := hand.Evaluate(cards[i:i+2], cards[12:17])
			fmt.Println(strconv.FormatInt(int64(handValue), 16), mask)
		}
	}
}
