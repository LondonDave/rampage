//Package hand contains the poker table game logic for poker rampage
package hand

import (
	"crypto/rand"
	"log"
	"math/big"
)

type Tx struct {
	H map[int]Hand
	A map[int]Account
}

type Account struct {
	Name       string
	SmallBlind int
	Stack      int
}

//Hand holds state data for a poker hand
type Hand struct {
	ID           int
	Round        int
	SmallBlind   int
	CurrentBuyIn int
	Pot          int
	MinimumRaise int
	Dealer       int
	InAction     int
	Player       []Player
	Board        []int
	Seq          int
	Eor          int
}

type Status int

const (
	folded Status = iota
	active
	prefolded
)

type Player struct {
	Name   string
	Status Status
	Stack  int
	Bet    int
	Cards
}

type Cards struct {
	Hole  []int
	Value int
	Mask  []int
}

func NewHand(id int, smallBlind int) *Hand {
	deck := shuffle(17)

	h := Hand{
		ID:         id,
		SmallBlind: smallBlind,
		Board:      deck[0:5],
		Player: []Player{
			Player{"sdvsdv", 1, 1, 1, evaluate(deck[5:7], deck[0:5])},
			Player{"vdsvsv", 1, 1, 1, evaluate(deck[7:9], deck[0:5])},
			Player{"dvsv", 1, 1, 1, evaluate(deck[9:11], deck[0:5])},
			Player{"dvsv", 1, 1, 1, evaluate(deck[11:13], deck[0:5])},
			Player{"sdvsv", 1, 1, 1, evaluate(deck[13:15], deck[0:5])},
			Player{"sdvs", 1, 1, 1, evaluate(deck[15:17], deck[0:5])},
		},
		//test data
		Round:        1,
		CurrentBuyIn: 1,
		Pot:          1,
		MinimumRaise: 1,
		Dealer:       1,
		InAction:     1,
		Seq:          1000,
		Eor:          1,
	}

	return &h
}

func cardName(card int) string {
	suitName := "chds"
	rankName := "A23456789TJQK"
	suit := card / 13
	rank := card % 13
	return rankName[rank:rank+1] + suitName[suit:suit+1]
}

func cardValue(cards string) []int {
	s := []int{}
	var suit, rank int
	suitName := "chds"
	rankName := "A23456789TJQK"

	for p := 0; p < len(cards); p = p + 2 {

		for i := 0; i < 13; i++ {
			if cards[p] == rankName[i] {
				rank = i
				break
			}
		}

		for i := 0; i < 4; i++ {
			if cards[p+1] == suitName[i] {
				suit = i
				break
			}
		}

		s = append(s, suit*13+rank)
	}
	return s
}

func shuffle(numCards int) []int {

	deck := [52]int{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
		13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
		26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38,
		39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
	}

	for i := 0; i < numCards; i++ {
		r, err := rand.Int(rand.Reader, big.NewInt(52-int64(i)))
		if err != nil {
			log.Fatalf("error:%s", err)
		}
		j := i + int(r.Int64())
		deck[i], deck[j] = deck[j], deck[i]
	}

	return deck[:numCards]

}

func evaluate(hole []int, board []int) Cards {
	var suits [4]int
	var ranks [14]int
	var order [53]int
	var highCard [7]int
	var flushCard [13]int
	var evaluation int
	var mask []int

	hand := append(append(board, hole[0]), hole[1])

	for i := 0; i < 7; i++ {
		suits[hand[i]/13]++
		ranks[hand[i]%13]++
		order[hand[i]] = 1
	}
	ranks[13] = ranks[0]

	maxMeld := 1
	maxMeldRank := 0
	secondPairRank := 0

	//find the biggest meld e.g.fours,trips,a pair or no pair
	for i := 13; i > 0; i-- {
		if ranks[i] > maxMeld {
			maxMeld = ranks[i]
			maxMeldRank = i
		}
	}
	//for pairs or trips find if there is a second pair
	if maxMeld == 2 || maxMeld == 3 {
		for i := 13; i > 0; i-- {
			if ranks[i] > 1 && i != maxMeldRank {
				secondPairRank = i
				break
			}
		}
	}
	//make a list of high cards of rank different from maxMeld and secondPair
	//N.B. for quads secondPairRank==0 so 2 2 2 2 A A 5 evaluates correctly
	cardCount := 0
	for i := 13; i > 0; i-- {
		if ranks[i] > 0 && i != maxMeldRank && i != secondPairRank {
			highCard[cardCount] = i
			cardCount++
		}
	}
	//assign values for fours,full house,trips,two pairs,pairs and no pair
	handValue1 := 0
	handValue2 := 0
	switch maxMeld {
	case 4:
		handValue1 = 8*0x100000 +
			(maxMeldRank+1)*0x10000 +
			(maxMeldRank+1)*0x1000 +
			(maxMeldRank+1)*0x100 +
			(maxMeldRank+1)*0x10 +
			(highCard[0]+1)*0x1
	case 3:
		if secondPairRank != 0 {
			handValue1 = 7*0x100000 +
				(maxMeldRank+1)*0x10000 +
				(maxMeldRank+1)*0x1000 +
				(maxMeldRank+1)*0x100 +
				(secondPairRank+1)*0x10 +
				(secondPairRank+1)*0x1
		} else {
			handValue1 = 4*0x100000 +
				(maxMeldRank+1)*0x10000 +
				(maxMeldRank+1)*0x1000 +
				(maxMeldRank+1)*0x100 +
				(highCard[0]+1)*0x10 +
				(highCard[1]+1)*0x1
		}
	case 2:
		if secondPairRank != 0 {
			handValue1 = 3*0x100000 +
				(maxMeldRank+1)*0x10000 +
				(maxMeldRank+1)*0x1000 +
				(secondPairRank+1)*0x100 +
				(secondPairRank+1)*0x10 +
				(highCard[0]+1)*0x1
		} else {
			handValue1 = 2*0x100000 +
				(maxMeldRank+1)*0x10000 +
				(maxMeldRank+1)*0x1000 +
				(highCard[0]+1)*0x100 +
				(highCard[1]+1)*0x10 +
				(highCard[2]+1)*0x1
		}
	case 1:
		handValue1 = 1*0x100000 +
			(highCard[0]+1)*0x10000 +
			(highCard[1]+1)*0x1000 +
			(highCard[2]+1)*0x100 +
			(highCard[3]+1)*0x10 +
			(highCard[4]+1)*0x1
	}
	//check for flush
	flushSuit := -1
	for i := 0; i < 4; i++ {
		if suits[i] >= 5 {
			flushSuit = i
		}
	}
	count := 0
	if flushSuit >= 0 {
		// check for straight flush and evaluate
		order[(flushSuit+1)*13] = order[flushSuit*13]
		count = 0
		for i := (flushSuit + 1) * 13; i >= flushSuit*13; i-- {
			if order[i] > 0 {
				count++
			} else {
				count = 0
			}
			if count == 5 {
				handValue2 = 9*0x100000 +
					(i-flushSuit*13+5)*0x10000 +
					(i-flushSuit*13+4)*0x1000 +
					(i-flushSuit*13+3)*0x100 +
					(i-flushSuit*13+2)*0x10 +
					(i-flushSuit*13+1)*0x1
				break
			}
		}
		if handValue2 == 0 {
			//evaluate flush
			count := 0
			for i := (flushSuit + 1) * 13; i >= flushSuit*13; i-- {
				if order[i] > 0 {
					flushCard[count] = i - flushSuit*13
					count++
				}
			}
			handValue2 = 6*0x100000 +
				(flushCard[0]+1)*0x10000 +
				(flushCard[1]+1)*0x1000 +
				(flushCard[2]+1)*0x100 +
				(flushCard[3]+1)*0x10 +
				(flushCard[4] + 1)
		}
	} else {
		//check for straight
		count := 0
		straightRank := 0
		for i := 13; i >= 0; i-- {
			if ranks[i] > 0 {
				count++
			} else {
				count = 0
			}
			if count == 5 {
				straightRank = i + 5
				handValue2 = 5*0x100000 +
					straightRank*0x10000 +
					(straightRank-1)*0x1000 +
					(straightRank-2)*0x100 +
					(straightRank-3)*0x10 +
					(straightRank-4)*0x1
				break
			}
		}
	}

	if handValue1 > handValue2 {
		evaluation = handValue1
	} else {
		evaluation = handValue2
	}

	mask = []int{0, 0, 0, 0, 0, 0, 0}

	if flushSuit >= 0 {
		for i := 4; i >= 0; i-- {
			cardRank := int((uint(evaluation)&(0xf<<uint(4*i)))>>uint(4*i) - 1)
			if cardRank == 13 {
				cardRank = 0
			}
			for j := 0; j < 7; j++ {
				if hand[j] == cardRank+13*flushSuit && mask[j] == 0 {
					mask[j] = 1
					break
				}
			}
		}
	} else {
		for i := 4; i >= 0; i-- {
			cardRank := int((uint(evaluation)&(0xf<<uint(4*i)))>>uint(4*i) - 1)
			if cardRank == 13 {
				cardRank = 0
			}
			for j := 0; j < 7; j++ {
				if hand[j]%13 == cardRank && mask[j] == 0 {
					mask[j] = 1
					break
				}
			}
		}
	}
	return Cards{hole, evaluation, mask}
}
